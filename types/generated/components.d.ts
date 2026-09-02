import type { Schema, Struct } from '@strapi/strapi';

export interface CommerceOrderLine extends Struct.ComponentSchema {
  collectionName: 'components_commerce_order_lines';
  info: {
    description: "Copie fig\u00E9e d'un article achet\u00E9";
    displayName: 'Ligne de commande';
  };
  attributes: {
    productDocumentId: Schema.Attribute.String & Schema.Attribute.Required;
    productName: Schema.Attribute.String & Schema.Attribute.Required;
    quantity: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 10;
          min: 1;
        },
        number
      >;
    unitPrice: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'commerce.order-line': CommerceOrderLine;
    }
  }
}
