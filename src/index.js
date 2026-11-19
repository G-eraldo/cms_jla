'use strict';

const { releaseExpiredReservations } = require('./api/order/services/stock-reservation');

module.exports = {
  register(/*{ strapi }*/) {},

  async bootstrap({ strapi }) {
    const seeds = strapi.store({ type: 'core', name: 'maison-jla' });
    if (!(await seeds.get({ key: 'winter-collection-v1' }))) {
      const collections = strapi.documents('api::jewelry-collection.jewelry-collection');
      const existing = await collections.findFirst({ filters: { slug: 'collection-hivernale' }, fields: ['slug'] });
      if (!existing) {
        await collections.create({
          status: 'published',
          data: { name: 'Collection hivernale', slug: 'collection-hivernale' },
        });
      }
      await seeds.set({ key: 'winter-collection-v1', value: true });
    }

    try {
      const pluginStore = strapi.store({ type: 'plugin', name: 'users-permissions' });
      const advanced = (await pluginStore.get({ key: 'advanced' })) || {};
      if (advanced.allow_register !== false) {
        await pluginStore.set({
          key: 'advanced',
          value: { ...advanced, allow_register: false },
        });
      }
    } catch (error) {
      strapi.log.warn(`Impossible de verrouiller l'inscription publique : ${error.message}`);
    }

    try {
      await releaseExpiredReservations(strapi);
    } catch (error) {
      strapi.log.error(`Libération initiale des réservations expirées : ${error.message}`);
    }
  },
};
