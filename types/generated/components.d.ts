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

export interface CommerceProductSafety extends Struct.ComponentSchema {
  collectionName: 'components_commerce_product_safeties';
  info: {
    description: "Informations RSGP affich\u00E9es avant l'achat. Les coordonn\u00E9es Maison JLA et les avertissements sont pr\u00E9remplis.";
    displayName: 'S\u00E9curit\u00E9 et tra\u00E7abilit\u00E9 produit';
  };
  attributes: {
    batchNumber: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 100;
      }>;
    mainMaterials: Schema.Attribute.Text &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 500;
      }> &
      Schema.Attribute.DefaultTo<'Acier inoxydable.'>;
    manufacturerBrand: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 100;
      }> &
      Schema.Attribute.DefaultTo<'Maison JLA'>;
    manufacturerCompany: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 150;
      }> &
      Schema.Attribute.DefaultTo<'Julia Touret'>;
    manufacturerEmail: Schema.Attribute.Email &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'contact@maisonjla.fr'>;
    manufacturerPostalAddress: Schema.Attribute.Text &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 500;
      }> &
      Schema.Attribute.DefaultTo<'5 Rue Joliot-Curie\n80200 Doingt\nFrance'>;
    productReference: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 100;
      }>;
    riskAssessmentReference: Schema.Attribute.String &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 150;
      }>;
    safetyWarnings: Schema.Attribute.Text &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 2000;
      }> &
      Schema.Attribute.DefaultTo<'\u26A0\uFE0F Ne convient pas aux enfants de moins de 3 ans (pr\u00E9sence de petites pi\u00E8ces \u2013 risque d\u2019\u00E9touffement).\n\n\u26A0\uFE0F En cas d\u2019irritation ou de r\u00E9action allergique, retirer imm\u00E9diatement le bijou et consulter un professionnel de sant\u00E9 si n\u00E9cessaire.\n\n\u26A0\uFE0F Produit non destin\u00E9 \u00E0 \u00EAtre ing\u00E9r\u00E9.'>;
    supplierName: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 150;
      }>;
    supplierReference: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 150;
      }>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'commerce.order-line': CommerceOrderLine;
      'commerce.product-safety': CommerceProductSafety;
    }
  }
}
