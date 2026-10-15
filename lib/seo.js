// Canonical, og:image i dane strukturalne schema.org (JSON-LD).
const config = require('./config');
const site = require('./site');
const { isoWithOffset } = require('./format');
const images = require('./images');

const abs = (path) => `${config.baseUrl}${path}`;
const DEFAULT_OG = '/images/og-cover.jpg';

// Bezpieczne osadzenie JSON w <script type="application/ld+json">.
function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const priceString = (grosze) => (grosze / 100).toFixed(2);

function businessSchema() {
  const address = { '@type': 'PostalAddress', addressLocality: site.city, addressRegion: site.region, addressCountry: 'PL' };
  if (config.contact.studioAddress) address.streetAddress = config.contact.studioAddress;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': abs('/#pracownia'),
    name: site.name,
    alternateName: site.legalBrand,
    description: site.description,
    url: abs('/'),
    logo: abs('/icon-512.png'),
    image: abs(DEFAULT_OG),
    address,
    sameAs: site.social.map((s) => s.url),
    founder: { '@type': 'Person', name: site.owner, jobTitle: 'Introligatorka' },
  };
  if (config.contact.email) data.email = config.contact.email;
  if (config.contact.phone) data.telephone = config.contact.phone;
  return data;
}

function websiteSchema() {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: abs('/'), inLanguage: 'pl-PL' };
}

function breadcrumbs(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: abs(item.path) })),
  };
}

function eventSchema(workshop, session) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `Warsztaty introligatorskie: ${workshop.title}`,
    description: workshop.summary,
    startDate: isoWithOffset(session.starts_at),
    endDate: isoWithOffset(session.ends_at),
    eventStatus: session.isCancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: session.location,
      address: { '@type': 'PostalAddress', addressLocality: site.city, addressCountry: 'PL' },
    },
    organizer: { '@type': 'Organization', name: site.name, url: abs('/') },
    performer: { '@type': 'Person', name: site.owner },
    url: abs(`/warsztaty/${workshop.slug}`),
  };
  const og = workshop.image && images.ogUrl(workshop.image, config.baseUrl);
  data.image = og || abs(DEFAULT_OG);
  if (session.price) {
    data.offers = {
      '@type': 'Offer',
      price: priceString(session.price),
      priceCurrency: 'PLN',
      availability: session.isFull ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      url: abs(`/warsztaty/${workshop.slug}/zapis?termin=${session.id}`),
    };
  }
  return data;
}

function productSchema(product) {
  const og = product.images.map((key) => images.ogUrl(key, config.baseUrl)).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.summary,
    sku: product.slug,
    image: og.length ? og : [abs(DEFAULT_OG)],
    brand: { '@type': 'Brand', name: site.name },
    offers: {
      '@type': 'Offer',
      price: priceString(product.price),
      priceCurrency: 'PLN',
      availability: product.available ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      itemCondition: 'https://schema.org/NewCondition',
      url: abs(`/sklep/${product.slug}`),
      seller: { '@id': abs('/#pracownia') },
    },
  };
}

module.exports = { abs, DEFAULT_OG, jsonLd, businessSchema, websiteSchema, breadcrumbs, eventSchema, productSchema };
