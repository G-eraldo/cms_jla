'use strict';

const collectionUid = 'api::jewelry-collection.jewelry-collection';

async function listPage(ctx, uid, query) {
  const page = Number(ctx.query.pagination?.page ?? 1);
  const pageSize = Number(ctx.query.pagination?.pageSize ?? 100);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return ctx.badRequest('Pagination invalide');
  }

  const documents = strapi.documents(uid);
  const [data, total] = await Promise.all([
    documents.findMany({ ...query, status: 'published', start: (page - 1) * pageSize, limit: pageSize }),
    documents.count({ filters: query.filters, status: 'published' }),
  ]);
  ctx.body = { data, meta: { pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) } } };
}

module.exports = {
  list(ctx) {
    return listPage(ctx, collectionUid, {
      fields: ['name', 'slug', 'description'],
      populate: { banner: { fields: ['url'] } },
      sort: ['name:asc', 'slug:asc'],
    });
  },

  async productSlugs(ctx) {
    const collection = await strapi.documents(collectionUid).findFirst({
      status: 'published', filters: { slug: ctx.params.slug }, fields: ['slug'],
    });
    if (!collection) return ctx.notFound();
    return listPage(ctx, 'api::product.product', {
      fields: ['slug'], sort: ['slug:asc'],
      filters: { collections: { documentId: collection.documentId, publishedAt: { $notNull: true } } },
    });
  },
};
