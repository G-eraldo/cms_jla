'use strict';

const { releaseExpiredReservations } = require('./api/order/services/stock-reservation');

module.exports = {
  register(/*{ strapi }*/) {},

  async bootstrap({ strapi }) {
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
