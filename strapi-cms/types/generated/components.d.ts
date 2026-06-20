import type { Schema, Struct } from '@strapi/strapi';

export interface BlockCtaBanner extends Struct.ComponentSchema {
  collectionName: 'components_block_cta_banners';
  info: {
    description: '\u0E41\u0E16\u0E1A\u0E40\u0E23\u0E35\u0E22\u0E01\u0E23\u0E49\u0E2D\u0E07\u0E43\u0E2B\u0E49\u0E17\u0E33 (\u0E1B\u0E38\u0E48\u0E21)';
    displayName: 'Block: CTA banner';
    icon: 'cursor';
  };
  attributes: {
    buttonLabel: Schema.Attribute.String;
    buttonUrl: Schema.Attribute.String & Schema.Attribute.DefaultTo<'#'>;
    heading: Schema.Attribute.String;
    text: Schema.Attribute.Text;
    theme: Schema.Attribute.Enumeration<['primary', 'dark', 'light']> &
      Schema.Attribute.DefaultTo<'primary'>;
  };
}

export interface BlockCustom extends Struct.ComponentSchema {
  collectionName: 'components_block_customs';
  info: {
    description: '\u0E1A\u0E25\u0E47\u0E2D\u0E01\u0E17\u0E35\u0E48\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07\u0E19\u0E34\u0E22\u0E32\u0E21\u0E08\u0E32\u0E01 Block Type (no-code)';
    displayName: 'Custom';
    icon: 'puzzle';
  };
  attributes: {
    props: Schema.Attribute.JSON;
    typeKey: Schema.Attribute.String;
  };
}

export interface BlockFeatureGrid extends Struct.ComponentSchema {
  collectionName: 'components_block_feature_grids';
  info: {
    description: '\u0E01\u0E23\u0E34\u0E14\u0E04\u0E38\u0E13\u0E2A\u0E21\u0E1A\u0E31\u0E15\u0E34 (\u0E44\u0E2D\u0E04\u0E2D\u0E19+\u0E2B\u0E31\u0E27\u0E02\u0E49\u0E2D+\u0E04\u0E33\u0E2D\u0E18\u0E34\u0E1A\u0E32\u0E22)';
    displayName: 'Block: Feature grid';
    icon: 'grid';
  };
  attributes: {
    columns: Schema.Attribute.Enumeration<['2', '3', '4']> &
      Schema.Attribute.DefaultTo<'3'>;
    heading: Schema.Attribute.String;
    items: Schema.Attribute.Component<'block.feature-item', true>;
  };
}

export interface BlockFeatureItem extends Struct.ComponentSchema {
  collectionName: 'components_block_feature_items';
  info: {
    description: '\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E04\u0E38\u0E13\u0E2A\u0E21\u0E1A\u0E31\u0E15\u0E34';
    displayName: 'Block: Feature item';
    icon: 'bulletList';
  };
  attributes: {
    icon: Schema.Attribute.Enumeration<
      [
        'i-id',
        'i-grid',
        'i-data',
        'i-build',
        'i-doc',
        'i-book',
        'i-shield',
        'i-users',
        'i-check',
        'i-chat',
      ]
    > &
      Schema.Attribute.DefaultTo<'i-check'>;
    text: Schema.Attribute.Text;
    title: Schema.Attribute.String;
  };
}

export interface BlockHero extends Struct.ComponentSchema {
  collectionName: 'components_block_heroes';
  info: {
    description: '\u0E2A\u0E48\u0E27\u0E19\u0E2B\u0E31\u0E27\u0E41\u0E1A\u0E19\u0E40\u0E19\u0E2D\u0E23\u0E4C\u0E02\u0E2D\u0E07 Landing';
    displayName: 'Block: Hero';
    icon: 'picture';
  };
  attributes: {
    align: Schema.Attribute.Enumeration<['left', 'center']> &
      Schema.Attribute.DefaultTo<'center'>;
    ctaLabel: Schema.Attribute.String;
    ctaUrl: Schema.Attribute.String & Schema.Attribute.DefaultTo<'#'>;
    heading: Schema.Attribute.String & Schema.Attribute.Required;
    image: Schema.Attribute.Media<'images'>;
    kicker: Schema.Attribute.String;
    subheading: Schema.Attribute.Text;
  };
}

export interface BlockImage extends Struct.ComponentSchema {
  collectionName: 'components_block_images';
  info: {
    description: '\u0E23\u0E39\u0E1B\u0E20\u0E32\u0E1E + \u0E04\u0E33\u0E1A\u0E23\u0E23\u0E22\u0E32\u0E22';
    displayName: 'Block: Image';
    icon: 'picture';
  };
  attributes: {
    caption: Schema.Attribute.String;
    full: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    image: Schema.Attribute.Media<'images'>;
  };
}

export interface BlockRichtext extends Struct.ComponentSchema {
  collectionName: 'components_block_richtexts';
  info: {
    description: '\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21';
    displayName: 'Block: Rich text';
    icon: 'align-left';
  };
  attributes: {
    body: Schema.Attribute.RichText;
  };
}

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
      'block.cta-banner': BlockCtaBanner;
      'block.custom': BlockCustom;
      'block.feature-grid': BlockFeatureGrid;
      'block.feature-item': BlockFeatureItem;
      'block.hero': BlockHero;
      'block.image': BlockImage;
      'block.richtext': BlockRichtext;
      'home.featured-promo': HomeFeaturedPromo;
      'home.hero': HomeHero;
      'home.link': HomeLink;
      'home.stat': HomeStat;
    }
  }
}
