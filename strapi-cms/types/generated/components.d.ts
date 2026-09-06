import type { Schema, Struct } from '@strapi/strapi';

export interface BlockAwards extends Struct.ComponentSchema {
  collectionName: 'components_block_awards';
  info: {
    description: '\u0E41\u0E16\u0E27\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25 (\u0E14\u0E36\u0E07\u0E08\u0E32\u0E01\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19 awards \u0E02\u0E2D\u0E07 tenant \u0E19\u0E35\u0E49\u0E41\u0E1A\u0E1A live)';
    displayName: 'Block: Awards';
    icon: 'star';
  };
  attributes: {
    eyebrow: Schema.Attribute.String;
    subtitle: Schema.Attribute.String;
    title: Schema.Attribute.String;
  };
}

export interface BlockBlockquote extends Struct.ComponentSchema {
  collectionName: 'components_block_blockquotes';
  info: {
    description: '\u0E04\u0E33\u0E04\u0E21\u0E2B\u0E23\u0E37\u0E2D\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E40\u0E14\u0E48\u0E19\u0E41\u0E1A\u0E1A\u0E40\u0E14\u0E35\u0E48\u0E22\u0E27 \u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E41\u0E2B\u0E25\u0E48\u0E07\u0E17\u0E35\u0E48\u0E21\u0E32 (\u0E16\u0E49\u0E32\u0E21\u0E35)';
    displayName: 'Block: Pull quote';
    icon: 'msg';
  };
  attributes: {
    attribution: Schema.Attribute.String;
    quote: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

export interface BlockCollectionList extends Struct.ComponentSchema {
  collectionName: 'components_block_collection_lists';
  info: {
    description: '\u0E01\u0E32\u0E23\u0E4C\u0E14\u0E01\u0E23\u0E34\u0E14\u0E08\u0E32\u0E01\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19\u0E43\u0E14 \u0E46 \u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A (Webflow-style Collection List) \u2014 no-code';
    displayName: 'Block: Collection list';
    icon: 'card';
  };
  attributes: {
    bodyField: Schema.Attribute.String;
    contentTypeUid: Schema.Attribute.String;
    dateField: Schema.Attribute.String;
    excerptField: Schema.Attribute.String;
    heading: Schema.Attribute.String;
    imageField: Schema.Attribute.String;
    layout: Schema.Attribute.Enumeration<['grid', 'map']> &
      Schema.Attribute.DefaultTo<'grid'>;
    linkField: Schema.Attribute.String;
    linkToDetail: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    pageSize: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 100;
          min: 1;
        },
        number
      > &
      Schema.Attribute.DefaultTo<12>;
    pluralName: Schema.Attribute.String;
    sortDir: Schema.Attribute.Enumeration<['asc', 'desc']> &
      Schema.Attribute.DefaultTo<'desc'>;
    sortField: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'createdAt'>;
    titleField: Schema.Attribute.String;
    videoUrlField: Schema.Attribute.String;
  };
}

export interface BlockComparison extends Struct.ComponentSchema {
  collectionName: 'components_block_comparisons';
  info: {
    description: '\u0E01\u0E32\u0E23\u0E4C\u0E14\u0E40\u0E1B\u0E23\u0E35\u0E22\u0E1A\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E15\u0E31\u0E27\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E2B\u0E23\u0E37\u0E2D\u0E41\u0E1E\u0E47\u0E01\u0E40\u0E01\u0E08\u0E23\u0E32\u0E04\u0E32\u0E41\u0E1A\u0E1A\u0E40\u0E04\u0E35\u0E22\u0E07\u0E02\u0E49\u0E32\u0E07\u0E01\u0E31\u0E19';
    displayName: 'Block: Comparison / Pricing';
    icon: 'grid';
  };
  attributes: {
    columns: Schema.Attribute.Component<'block.comparison-column', true>;
    heading: Schema.Attribute.String;
  };
}

export interface BlockComparisonColumn extends Struct.ComponentSchema {
  collectionName: 'components_block_comparison_columns';
  info: {
    description: '\u0E2B\u0E19\u0E36\u0E48\u0E07\u0E15\u0E31\u0E27\u0E40\u0E25\u0E37\u0E2D\u0E01/\u0E41\u0E1E\u0E47\u0E01\u0E40\u0E01\u0E08\u0E43\u0E19\u0E15\u0E32\u0E23\u0E32\u0E07\u0E40\u0E1B\u0E23\u0E35\u0E22\u0E1A\u0E40\u0E17\u0E35\u0E22\u0E1A';
    displayName: 'Block: Comparison column';
    icon: 'grid';
  };
  attributes: {
    ctaLabel: Schema.Attribute.String;
    ctaUrl: Schema.Attribute.String;
    description: Schema.Attribute.Text;
    features: Schema.Attribute.JSON;
    highlight: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    period: Schema.Attribute.String;
    price: Schema.Attribute.String;
  };
}

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

export interface BlockEmbed extends Struct.ComponentSchema {
  collectionName: 'components_block_embeds';
  info: {
    description: '\u0E42\u0E04\u0E49\u0E14 HTML/CSS/JS \u0E14\u0E34\u0E1A \u2014 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E01\u0E23\u0E13\u0E35\u0E17\u0E35\u0E48\u0E1A\u0E25\u0E47\u0E2D\u0E01\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E23\u0E39\u0E1B\u0E17\u0E33\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49 (\u0E40\u0E0A\u0E48\u0E19 widget \u0E08\u0E32\u0E01\u0E20\u0E32\u0E22\u0E19\u0E2D\u0E01)';
    displayName: 'Block: Custom Code';
    icon: 'code';
  };
  attributes: {
    html: Schema.Attribute.Text;
    label: Schema.Attribute.String;
  };
}

export interface BlockFaq extends Struct.ComponentSchema {
  collectionName: 'components_block_faqs';
  info: {
    description: '\u0E2D\u0E04\u0E2D\u0E23\u0E4C\u0E40\u0E14\u0E35\u0E22\u0E19\u0E04\u0E33\u0E16\u0E32\u0E21\u0E17\u0E35\u0E48\u0E1E\u0E1A\u0E1A\u0E48\u0E2D\u0E22 (\u0E14\u0E36\u0E07\u0E08\u0E32\u0E01\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19 faqs \u0E02\u0E2D\u0E07 tenant \u0E19\u0E35\u0E49\u0E41\u0E1A\u0E1A live)';
    displayName: 'Block: FAQ';
    icon: 'question';
  };
  attributes: {
    eyebrow: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'\u0E16\u0E32\u0E21\u2013\u0E15\u0E2D\u0E1A'>;
    title: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'\u0E04\u0E33\u0E16\u0E32\u0E21\u0E17\u0E35\u0E48\u0E1E\u0E1A\u0E1A\u0E48\u0E2D\u0E22'>;
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
    colorTheme: Schema.Attribute.Enumeration<
      ['orange', 'blue', 'green', 'amber', 'purple', 'teal']
    > &
      Schema.Attribute.DefaultTo<'blue'>;
    icon: Schema.Attribute.String & Schema.Attribute.DefaultTo<'i-check'>;
    text: Schema.Attribute.Text;
    title: Schema.Attribute.String;
    url: Schema.Attribute.String;
  };
}

export interface BlockFeaturedPromo extends Struct.ComponentSchema {
  collectionName: 'components_block_featured_promos';
  info: {
    description: '\u0E41\u0E1C\u0E07\u0E42\u0E1B\u0E23\u0E42\u0E21\u0E17\u0E40\u0E14\u0E48\u0E19\u0E1E\u0E23\u0E49\u0E2D\u0E21\u0E40\u0E0A\u0E47\u0E04\u0E25\u0E34\u0E2A\u0E15\u0E4C\u0E41\u0E25\u0E30\u0E1B\u0E38\u0E48\u0E21 CTA';
    displayName: 'Block: Featured promo';
    icon: 'bulletList';
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

export interface BlockForm extends Struct.ComponentSchema {
  collectionName: 'components_block_forms';
  info: {
    description: '\u0E41\u0E1A\u0E1A\u0E1F\u0E2D\u0E23\u0E4C\u0E21\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E30 (\u0E15\u0E34\u0E14\u0E15\u0E48\u0E2D\u0E40\u0E23\u0E32/\u0E23\u0E49\u0E2D\u0E07\u0E40\u0E23\u0E35\u0E22\u0E19/\u0E2A\u0E21\u0E31\u0E04\u0E23\u0E07\u0E32\u0E19/\u0E25\u0E07\u0E17\u0E30\u0E40\u0E1A\u0E35\u0E22\u0E19) \u2014 \u0E1C\u0E39\u0E01\u0E01\u0E31\u0E1A\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32\u0E17\u0E35\u0E48\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E44\u0E27\u0E49\u0E25\u0E48\u0E27\u0E07\u0E2B\u0E19\u0E49\u0E32, no-code';
    displayName: 'Block: Form';
    icon: 'inbox';
  };
  attributes: {
    consentText: Schema.Attribute.Text;
    contentTypeUid: Schema.Attribute.String & Schema.Attribute.Required;
    heading: Schema.Attribute.String;
    mode: Schema.Attribute.Enumeration<['submit', 'track']> &
      Schema.Attribute.DefaultTo<'submit'>;
    submitLabel: Schema.Attribute.String;
    successMessage: Schema.Attribute.Text;
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

export interface BlockHighlights extends Struct.ComponentSchema {
  collectionName: 'components_block_highlights';
  info: {
    description: '\u0E41\u0E16\u0E1A\u0E44\u0E2E\u0E44\u0E25\u0E15\u0E4C\u0E1B\u0E23\u0E30\u0E0A\u0E32\u0E2A\u0E31\u0E21\u0E1E\u0E31\u0E19\u0E18\u0E4C (\u0E14\u0E36\u0E07\u0E08\u0E32\u0E01\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19 banners \u0E02\u0E2D\u0E07 tenant \u0E19\u0E35\u0E49\u0E41\u0E1A\u0E1A live)';
    displayName: 'Block: Highlights';
    icon: 'images';
  };
  attributes: {};
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

export interface BlockLogoCloud extends Struct.ComponentSchema {
  collectionName: 'components_block_logo_clouds';
  info: {
    description: '\u0E41\u0E16\u0E1A\u0E42\u0E25\u0E42\u0E01\u0E49\u0E1E\u0E31\u0E19\u0E18\u0E21\u0E34\u0E15\u0E23/\u0E2B\u0E19\u0E48\u0E27\u0E22\u0E07\u0E32\u0E19\u0E17\u0E35\u0E48\u0E40\u0E01\u0E35\u0E48\u0E22\u0E27\u0E02\u0E49\u0E2D\u0E07';
    displayName: 'Block: Logo cloud';
    icon: 'grid';
  };
  attributes: {
    heading: Schema.Attribute.String;
    items: Schema.Attribute.Component<'block.logo-item', true>;
  };
}

export interface BlockLogoItem extends Struct.ComponentSchema {
  collectionName: 'components_block_logo_items';
  info: {
    description: '\u0E42\u0E25\u0E42\u0E01\u0E49\u0E2B\u0E19\u0E36\u0E48\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23';
    displayName: 'Block: Logo item';
    icon: 'grid';
  };
  attributes: {
    logo: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    url: Schema.Attribute.String;
  };
}

export interface BlockNewsPanel extends Struct.ComponentSchema {
  collectionName: 'components_block_news_panels';
  info: {
    description: '\u0E41\u0E17\u0E47\u0E1A\u0E02\u0E48\u0E32\u0E27/\u0E1A\u0E17\u0E04\u0E27\u0E32\u0E21 (\u0E14\u0E36\u0E07\u0E08\u0E32\u0E01\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19 articles \u0E02\u0E2D\u0E07 tenant \u0E19\u0E35\u0E49\u0E41\u0E1A\u0E1A live)';
    displayName: 'Block: News panel';
    icon: 'layout';
  };
  attributes: {
    articleTabLabel: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'\u0E1A\u0E17\u0E04\u0E27\u0E32\u0E21'>;
    newsTabLabel: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'DGA News'>;
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

export interface BlockSpacer extends Struct.ComponentSchema {
  collectionName: 'components_block_spacers';
  info: {
    description: '\u0E0A\u0E48\u0E2D\u0E07\u0E27\u0E48\u0E32\u0E07\u0E2B\u0E23\u0E37\u0E2D\u0E40\u0E2A\u0E49\u0E19\u0E04\u0E31\u0E48\u0E19\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E2A\u0E48\u0E27\u0E19\u0E15\u0E48\u0E32\u0E07 \u0E46 \u0E02\u0E2D\u0E07\u0E2B\u0E19\u0E49\u0E32';
    displayName: 'Block: Spacer / Divider';
    icon: 'layout';
  };
  attributes: {
    size: Schema.Attribute.Enumeration<['sm', 'md', 'lg']> &
      Schema.Attribute.DefaultTo<'md'>;
    style: Schema.Attribute.Enumeration<['space', 'line']> &
      Schema.Attribute.DefaultTo<'space'>;
  };
}

export interface BlockStatRow extends Struct.ComponentSchema {
  collectionName: 'components_block_stat_rows';
  info: {
    description: '\u0E41\u0E16\u0E1A\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E2A\u0E16\u0E34\u0E15\u0E34';
    displayName: 'Block: Stat row';
    icon: 'chartBubble';
  };
  attributes: {
    items: Schema.Attribute.Component<'block.stat-row-item', true>;
  };
}

export interface BlockStatRowItem extends Struct.ComponentSchema {
  collectionName: 'components_block_stat_row_items';
  info: {
    description: '\u0E2B\u0E19\u0E36\u0E48\u0E07\u0E15\u0E31\u0E27\u0E40\u0E25\u0E02\u0E2A\u0E16\u0E34\u0E15\u0E34';
    displayName: 'Block: Stat row item';
    icon: 'chartBubble';
  };
  attributes: {
    icon: Schema.Attribute.String & Schema.Attribute.DefaultTo<'users'>;
    label: Schema.Attribute.String;
    value: Schema.Attribute.String;
  };
}

export interface BlockTabItem extends Struct.ComponentSchema {
  collectionName: 'components_block_tab_items';
  info: {
    description: '\u0E41\u0E1C\u0E07\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32\u0E2B\u0E19\u0E36\u0E48\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23 (\u0E2B\u0E31\u0E27\u0E02\u0E49\u0E2D + \u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32)';
    displayName: 'Block: Tab item';
    icon: 'doc';
  };
  attributes: {
    body: Schema.Attribute.RichText;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface BlockTabs extends Struct.ComponentSchema {
  collectionName: 'components_block_tabs';
  info: {
    description: '\u0E41\u0E17\u0E47\u0E1A\u0E2B\u0E23\u0E37\u0E2D\u0E41\u0E2D\u0E04\u0E04\u0E2D\u0E23\u0E4C\u0E40\u0E14\u0E35\u0E22\u0E19\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E08\u0E31\u0E14\u0E01\u0E25\u0E38\u0E48\u0E21\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32 \u2014 \u0E2A\u0E25\u0E31\u0E1A\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E44\u0E14\u0E49\u0E17\u0E31\u0E49\u0E07\u0E2A\u0E2D\u0E07\u0E41\u0E1A\u0E1A\u0E08\u0E32\u0E01\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E0A\u0E38\u0E14\u0E40\u0E14\u0E35\u0E22\u0E27';
    displayName: 'Block: Tabs / Accordion';
    icon: 'layout';
  };
  attributes: {
    heading: Schema.Attribute.String;
    items: Schema.Attribute.Component<'block.tab-item', true>;
    layout: Schema.Attribute.Enumeration<['tabs', 'accordion']> &
      Schema.Attribute.DefaultTo<'tabs'>;
  };
}

export interface BlockTeamGrid extends Struct.ComponentSchema {
  collectionName: 'components_block_team_grids';
  info: {
    description: '\u0E01\u0E23\u0E34\u0E14\u0E17\u0E35\u0E21\u0E07\u0E32\u0E19/\u0E1A\u0E38\u0E04\u0E25\u0E32\u0E01\u0E23 (\u0E23\u0E39\u0E1B+\u0E0A\u0E37\u0E48\u0E2D+\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07)';
    displayName: 'Block: Team grid';
    icon: 'users';
  };
  attributes: {
    heading: Schema.Attribute.String;
    items: Schema.Attribute.Component<'block.team-item', true>;
  };
}

export interface BlockTeamItem extends Struct.ComponentSchema {
  collectionName: 'components_block_team_items';
  info: {
    description: '\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E17\u0E35\u0E21\u0E2B\u0E19\u0E36\u0E48\u0E07\u0E04\u0E19';
    displayName: 'Block: Team item';
    icon: 'users';
  };
  attributes: {
    bio: Schema.Attribute.Text;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    photo: Schema.Attribute.Media<'images'>;
    role: Schema.Attribute.String;
  };
}

export interface BlockTestimonialItem extends Struct.ComponentSchema {
  collectionName: 'components_block_testimonial_items';
  info: {
    description: '\u0E04\u0E33\u0E23\u0E31\u0E1A\u0E23\u0E2D\u0E07\u0E2B\u0E19\u0E36\u0E48\u0E07\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23';
    displayName: 'Block: Testimonial item';
    icon: 'msg';
  };
  attributes: {
    author: Schema.Attribute.String;
    avatar: Schema.Attribute.Media<'images'>;
    quote: Schema.Attribute.Text & Schema.Attribute.Required;
    role: Schema.Attribute.String;
  };
}

export interface BlockTestimonials extends Struct.ComponentSchema {
  collectionName: 'components_block_testimonials';
  info: {
    description: '\u0E04\u0E33\u0E23\u0E31\u0E1A\u0E23\u0E2D\u0E07/\u0E23\u0E35\u0E27\u0E34\u0E27\u0E08\u0E32\u0E01\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E2B\u0E23\u0E37\u0E2D\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23';
    displayName: 'Block: Testimonials';
    icon: 'msg';
  };
  attributes: {
    heading: Schema.Attribute.String;
    items: Schema.Attribute.Component<'block.testimonial-item', true>;
  };
}

export interface BlockVideoChannel extends Struct.ComponentSchema {
  collectionName: 'components_block_video_channels';
  info: {
    description: '\u0E01\u0E23\u0E34\u0E14\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D (\u0E14\u0E36\u0E07\u0E08\u0E32\u0E01\u0E04\u0E2D\u0E25\u0E40\u0E25\u0E01\u0E0A\u0E31\u0E19 videos \u0E02\u0E2D\u0E07 tenant \u0E19\u0E35\u0E49\u0E41\u0E1A\u0E1A live)';
    displayName: 'Block: Video channel';
    icon: 'play';
  };
  attributes: {
    title: Schema.Attribute.String & Schema.Attribute.DefaultTo<'DGA Channel'>;
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
      'block.awards': BlockAwards;
      'block.blockquote': BlockBlockquote;
      'block.collection-list': BlockCollectionList;
      'block.comparison': BlockComparison;
      'block.comparison-column': BlockComparisonColumn;
      'block.cta-banner': BlockCtaBanner;
      'block.custom': BlockCustom;
      'block.embed': BlockEmbed;
      'block.faq': BlockFaq;
      'block.feature-grid': BlockFeatureGrid;
      'block.feature-item': BlockFeatureItem;
      'block.featured-promo': BlockFeaturedPromo;
      'block.form': BlockForm;
      'block.hero': BlockHero;
      'block.highlights': BlockHighlights;
      'block.image': BlockImage;
      'block.logo-cloud': BlockLogoCloud;
      'block.logo-item': BlockLogoItem;
      'block.news-panel': BlockNewsPanel;
      'block.richtext': BlockRichtext;
      'block.spacer': BlockSpacer;
      'block.stat-row': BlockStatRow;
      'block.stat-row-item': BlockStatRowItem;
      'block.tab-item': BlockTabItem;
      'block.tabs': BlockTabs;
      'block.team-grid': BlockTeamGrid;
      'block.team-item': BlockTeamItem;
      'block.testimonial-item': BlockTestimonialItem;
      'block.testimonials': BlockTestimonials;
      'block.video-channel': BlockVideoChannel;
      'home.featured-promo': HomeFeaturedPromo;
      'home.hero': HomeHero;
      'home.link': HomeLink;
      'home.stat': HomeStat;
    }
  }
}
