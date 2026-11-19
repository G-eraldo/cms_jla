'use strict';

module.exports = {
  routes: [
    { method: 'GET', path: '/jewelry-collections', handler: 'jewelry-collection.list', config: { auth: false } },
    { method: 'GET', path: '/jewelry-collections/:slug/products', handler: 'jewelry-collection.productSlugs', config: { auth: false } },
  ],
};
