import type { Schema, Struct } from '@strapi/strapi';

export interface HomeFeaturedPromo extends Struct.ComponentSchema {
  collectionName: 'components_home_featured_promos';
  info: {
    description: '\u0E41\u0E1A\u0E19\u0E40\u0E19\u0E2D\u0E23\u0E4C\u0E42\u0E1B\u0E23\u0E42\u0E21\u0E17\u0E40\u0E14\u0E48\u0E19\u0E17\u0E49\u0E32\u0E22\u0E2B\u0E19\u0E49\u0E32 (\u0E40\u0E0A\u0E48\u0E19 \u0E41\u0E2D\u0E1B\u0E17\u0E32\u0E07\u0E23\u0E31\u0E10)';
    displayName: 'Featured Promo';
    icon: 'star';
  };
  attributes: {
    description: Schema.Attribute.Text;
    eyebrow: Schema.Attribute.String;
    image: Schema.Attribute.Media<'images'>;
    items: Schema.Attribute.JSON;
    primaryLabel: Schema.Attribute.String;
    primaryUrl: Schema.Attribute.String & Schema.Attribute.DefaultTo<'#'>;
    secondaryLabel: Schema.Attribute.String;
    secondaryUrl: Schema.Attribute.String & Schema.Attribute.DefaultTo<'#'>;
    title: Schema.Attribute.String;
  };
}

export interface HomeHero extends Struct.ComponentSchema {
  collectionName: 'components_home_heroes';
  info: {
    description: '\u0E2A\u0E48\u0E27\u0E19\u0E2B\u0E31\u0E27\u0E2B\u0E19\u0E49\u0E32\u0E41\u0E23\u0E01: \u0E2B\u0E31\u0E27\u0E40\u0E23\u0E37\u0E48\u0E2D\u0E07 \u0E04\u0E33\u0E42\u0E1B\u0E23\u0E22 \u0E0A\u0E48\u0E2D\u0E07\u0E04\u0E49\u0E19\u0E2B\u0E32 \u0E41\u0E25\u0E30\u0E2A\u0E44\u0E25\u0E14\u0E4C\u0E20\u0E32\u0E1E\u0E1E\u0E37\u0E49\u0E19\u0E2B\u0E25\u0E31\u0E07';
    displayName: 'Hero';
    icon: 'picture';
  };
  attributes: {
    headingAccent: Schema.Attribute.String;
    headingLine1: Schema.Attribute.String;
    kicker: Schema.Attribute.String;
    lead: Schema.Attribute.Text;
    popularTags: Schema.Attribute.Component<'home.link', true>;
    searchPlaceholder: Schema.Attribute.String;
    slides: Schema.Attribute.Media<'images', true>;
    typewriterPhrases: Schema.Attribute.JSON;
  };
}

export interface HomeLink extends Struct.ComponentSchema {
  collectionName: 'components_home_links';
  info: {
    description: '\u0E25\u0E34\u0E07\u0E01\u0E4C\u0E1B\u0E49\u0E32\u0E22\u0E01\u0E33\u0E01\u0E31\u0E1A (label + url) \u0E40\u0E0A\u0E48\u0E19 \u0E41\u0E17\u0E47\u0E01\u0E04\u0E49\u0E19\u0E2B\u0E32\u0E22\u0E2D\u0E14\u0E19\u0E34\u0E22\u0E21';
    displayName: 'Link';
    icon: 'link';
  };
  attributes: {
    label: Schema.Attribute.String;
    url: Schema.Attribute.String & Schema.Attribute.DefaultTo<'#'>;
  };
}

export interface HomeStat extends Struct.ComponentSchema {
  collectionName: 'components_home_stats';
  info: {
    description: '\u0E2A\u0E16\u0E34\u0E15\u0E34\u0E01\u0E32\u0E23\u0E43\u0E2B\u0E49\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23 (\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02 + \u0E1B\u0E49\u0E32\u0E22\u0E01\u0E33\u0E01\u0E31\u0E1A)';
    displayName: 'Stat';
    icon: 'chartBubble';
  };
  attributes: {
    icon: Schema.Attribute.Enumeration<
      ['users', 'grid', 'shield', 'clock', 'data', 'build']
    > &
      Schema.Attribute.DefaultTo<'users'>;
    label: Schema.Attribute.String;
    value: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'home.featured-promo': HomeFeaturedPromo;
      'home.hero': HomeHero;
      'home.link': HomeLink;
      'home.stat': HomeStat;
    }
  }
}
