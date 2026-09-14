import type { Schema, Struct } from '@strapi/strapi';

export interface AdminApiToken extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_api_tokens';
  info: {
    description: '';
    displayName: 'Api Token';
    name: 'Api Token';
    pluralName: 'api-tokens';
    singularName: 'api-token';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    accessKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    adminPermissions: Schema.Attribute.Relation<
      'oneToMany',
      'admin::permission'
    >;
    adminUserOwner: Schema.Attribute.Relation<'manyToOne', 'admin::user'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Schema.Attribute.DefaultTo<''>;
    encryptedKey: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    expiresAt: Schema.Attribute.DateTime;
    kind: Schema.Attribute.Enumeration<['content-api', 'admin']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'content-api'>;
    lastUsedAt: Schema.Attribute.DateTime;
    lifespan: Schema.Attribute.BigInteger;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::api-token'> &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'admin::api-token-permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    type: Schema.Attribute.Enumeration<['read-only', 'full-access', 'custom']> &
      Schema.Attribute.DefaultTo<'read-only'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminApiTokenPermission extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_api_token_permissions';
  info: {
    description: '';
    displayName: 'API Token Permission';
    name: 'API Token Permission';
    pluralName: 'api-token-permissions';
    singularName: 'api-token-permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::api-token-permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    token: Schema.Attribute.Relation<'manyToOne', 'admin::api-token'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminPermission extends Struct.CollectionTypeSchema {
  collectionName: 'admin_permissions';
  info: {
    description: '';
    displayName: 'Permission';
    name: 'Permission';
    pluralName: 'permissions';
    singularName: 'permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    actionParameters: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    apiToken: Schema.Attribute.Relation<'manyToOne', 'admin::api-token'>;
    conditions: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<[]>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::permission'> &
      Schema.Attribute.Private;
    properties: Schema.Attribute.JSON & Schema.Attribute.DefaultTo<{}>;
    publishedAt: Schema.Attribute.DateTime;
    role: Schema.Attribute.Relation<'manyToOne', 'admin::role'>;
    subject: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminRole extends Struct.CollectionTypeSchema {
  collectionName: 'admin_roles';
  info: {
    description: '';
    displayName: 'Role';
    name: 'Role';
    pluralName: 'roles';
    singularName: 'role';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    code: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::role'> &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<'oneToMany', 'admin::permission'>;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    users: Schema.Attribute.Relation<'manyToMany', 'admin::user'>;
  };
}

export interface AdminSession extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_sessions';
  info: {
    description: 'Session Manager storage';
    displayName: 'Session';
    name: 'Session';
    pluralName: 'sessions';
    singularName: 'session';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
    i18n: {
      localized: false;
    };
  };
  attributes: {
    absoluteExpiresAt: Schema.Attribute.DateTime & Schema.Attribute.Private;
    childId: Schema.Attribute.String & Schema.Attribute.Private;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    deviceId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    expiresAt: Schema.Attribute.DateTime &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::session'> &
      Schema.Attribute.Private;
    origin: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    sessionId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique;
    status: Schema.Attribute.String & Schema.Attribute.Private;
    type: Schema.Attribute.String & Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    userId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
  };
}

export interface AdminTransferToken extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_transfer_tokens';
  info: {
    description: '';
    displayName: 'Transfer Token';
    name: 'Transfer Token';
    pluralName: 'transfer-tokens';
    singularName: 'transfer-token';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    accessKey: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }> &
      Schema.Attribute.DefaultTo<''>;
    expiresAt: Schema.Attribute.DateTime;
    lastUsedAt: Schema.Attribute.DateTime;
    lifespan: Schema.Attribute.BigInteger;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token-permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminTransferTokenPermission
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_transfer_token_permissions';
  info: {
    description: '';
    displayName: 'Transfer Token Permission';
    name: 'Transfer Token Permission';
    pluralName: 'transfer-token-permissions';
    singularName: 'transfer-token-permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'admin::transfer-token-permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    token: Schema.Attribute.Relation<'manyToOne', 'admin::transfer-token'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface AdminUser extends Struct.CollectionTypeSchema {
  collectionName: 'admin_users';
  info: {
    description: '';
    displayName: 'User';
    name: 'User';
    pluralName: 'users';
    singularName: 'user';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    apiTokens: Schema.Attribute.Relation<'oneToMany', 'admin::api-token'> &
      Schema.Attribute.Private;
    blocked: Schema.Attribute.Boolean &
      Schema.Attribute.Private &
      Schema.Attribute.DefaultTo<false>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    firstname: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    isActive: Schema.Attribute.Boolean &
      Schema.Attribute.Private &
      Schema.Attribute.DefaultTo<false>;
    lastname: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'admin::user'> &
      Schema.Attribute.Private;
    password: Schema.Attribute.Password &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    preferedLanguage: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    registrationToken: Schema.Attribute.String & Schema.Attribute.Private;
    resetPasswordToken: Schema.Attribute.String & Schema.Attribute.Private;
    roles: Schema.Attribute.Relation<'manyToMany', 'admin::role'> &
      Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    username: Schema.Attribute.String;
  };
}

export interface ApiAbEventAbEvent extends Struct.CollectionTypeSchema {
  collectionName: 'ab_events';
  info: {
    description: 'Anonymous A/B test impression & conversion counters (no personal data)';
    displayName: 'AB Event';
    pluralName: 'ab-events';
    singularName: 'ab-event';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    documentRef: Schema.Attribute.String & Schema.Attribute.Required;
    kind: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::ab-event.ab-event'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    variant: Schema.Attribute.String;
  };
}

export interface ApiAgentJobAgentJob extends Struct.CollectionTypeSchema {
  collectionName: 'agent_jobs';
  info: {
    description: 'WebX Agent background job (webx-studio lib/agent/jobs). Claimed, heartbeated, checkpointed and finished only through the secret-protected /api/internal/agent-jobs/* endpoints, each a compare-and-set on the lease token; never written through the generic entries route.';
    displayName: 'Agent Job';
    pluralName: 'agent-jobs';
    singularName: 'agent-job';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    attempts: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    budget: Schema.Attribute.JSON;
    cancelRequestedAt: Schema.Attribute.DateTime;
    checkpoint: Schema.Attribute.JSON;
    checkpointSeq: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    crashCount: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    crashSeq: Schema.Attribute.Integer;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    engine: Schema.Attribute.String & Schema.Attribute.DefaultTo<'strapi'>;
    events: Schema.Attribute.JSON;
    eventSeq: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    finishedAt: Schema.Attribute.DateTime;
    goal: Schema.Attribute.Text;
    heartbeatAt: Schema.Attribute.DateTime;
    idempotencyKey: Schema.Attribute.String;
    lang: Schema.Attribute.String & Schema.Attribute.DefaultTo<'en'>;
    lastError: Schema.Attribute.Text;
    lastSliceAt: Schema.Attribute.DateTime;
    leaseExpiresAt: Schema.Attribute.DateTime;
    leaseOwner: Schema.Attribute.String;
    leaseToken: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::agent-job.agent-job'
    > &
      Schema.Attribute.Private;
    notBefore: Schema.Attribute.DateTime;
    onQuestion: Schema.Attribute.String & Schema.Attribute.DefaultTo<'wait'>;
    outcome: Schema.Attribute.String;
    ownerEmail: Schema.Attribute.String & Schema.Attribute.Required;
    ownerUserId: Schema.Attribute.String & Schema.Attribute.Required;
    params: Schema.Attribute.JSON;
    pauseRequestedAt: Schema.Attribute.DateTime;
    pendingAnswer: Schema.Attribute.Text;
    policySnapshot: Schema.Attribute.JSON;
    priority: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    progress: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    requiredLevel: Schema.Attribute.String & Schema.Attribute.Required;
    result: Schema.Attribute.JSON;
    runState: Schema.Attribute.String & Schema.Attribute.DefaultTo<'queued'>;
    scheduleId: Schema.Attribute.String;
    startedAt: Schema.Attribute.DateTime;
    stateReason: Schema.Attribute.String;
    template: Schema.Attribute.String;
    tenantKey: Schema.Attribute.String & Schema.Attribute.Required;
    threadId: Schema.Attribute.String;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    tokensUsed: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAgentScheduleAgentSchedule
  extends Struct.CollectionTypeSchema {
  collectionName: 'agent_schedules';
  info: {
    description: 'A recurring WebX Agent background job (webx-studio lib/agent/jobs/schedules.ts). The tick advances it only through the secret-protected /api/internal/agent-schedules/* endpoints, each a compare-and-set on runSeq; never written through the generic entries route.';
    displayName: 'Agent Schedule';
    pluralName: 'agent-schedules';
    singularName: 'agent-schedule';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    authorizedAt: Schema.Attribute.DateTime;
    authorizedUntil: Schema.Attribute.DateTime;
    budget: Schema.Attribute.JSON;
    consecutiveFailures: Schema.Attribute.Integer &
      Schema.Attribute.DefaultTo<0>;
    countedJobId: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    disabledAt: Schema.Attribute.DateTime;
    disabledReason: Schema.Attribute.String;
    enabled: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    engine: Schema.Attribute.String & Schema.Attribute.DefaultTo<'strapi'>;
    lang: Schema.Attribute.String & Schema.Attribute.DefaultTo<'en'>;
    lastJobId: Schema.Attribute.String;
    lastRunAt: Schema.Attribute.DateTime;
    lastSkipReason: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::agent-schedule.agent-schedule'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    nextRunAt: Schema.Attribute.DateTime;
    ownerEmail: Schema.Attribute.String & Schema.Attribute.Required;
    ownerUserId: Schema.Attribute.String & Schema.Attribute.Required;
    params: Schema.Attribute.JSON;
    policySnapshot: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    recurrence: Schema.Attribute.JSON & Schema.Attribute.Required;
    requiredLevel: Schema.Attribute.String & Schema.Attribute.Required;
    runSeq: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    template: Schema.Attribute.String & Schema.Attribute.Required;
    tenantKey: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAgentThreadAgentThread extends Struct.CollectionTypeSchema {
  collectionName: 'agent_threads';
  info: {
    description: "WebX Agent conversation + run history (webx-studio's own bookkeeping \u2014 see lib/agent/threads.ts). Never written through the generic entries route; see governance.ts's assertBookkeepingWriteAllowed.";
    displayName: 'Agent Thread';
    pluralName: 'agent-threads';
    singularName: 'agent-thread';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    checkpoint: Schema.Attribute.JSON;
    context: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    lastRunId: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::agent-thread.agent-thread'
    > &
      Schema.Attribute.Private;
    messages: Schema.Attribute.JSON;
    ownerEmail: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    runState: Schema.Attribute.String & Schema.Attribute.DefaultTo<'idle'>;
    tenantKey: Schema.Attribute.String & Schema.Attribute.Required;
    title: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    usage: Schema.Attribute.JSON;
  };
}

export interface ApiApplicationApplication extends Struct.CollectionTypeSchema {
  collectionName: 'applications';
  info: {
    description: '\u0E43\u0E1A\u0E2A\u0E21\u0E31\u0E04\u0E23\u0E07\u0E32\u0E19 (\u0E23\u0E31\u0E1A\u0E08\u0E32\u0E01\u0E1F\u0E2D\u0E23\u0E4C\u0E21\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E30)';
    displayName: 'Application';
    pluralName: 'applications';
    singularName: 'application';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.String;
    email: Schema.Attribute.String;
    extra: Schema.Attribute.JSON;
    jobId: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::application.application'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    note: Schema.Attribute.Text;
    phone: Schema.Attribute.String;
    position: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    ref: Schema.Attribute.String & Schema.Attribute.Unique;
    resume: Schema.Attribute.Media<'images' | 'files'>;
    stage: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 3;
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiArticleArticle extends Struct.CollectionTypeSchema {
  collectionName: 'articles';
  info: {
    description: '\u0E02\u0E48\u0E32\u0E27\u0E41\u0E25\u0E30\u0E1A\u0E17\u0E04\u0E27\u0E32\u0E21 (DGA News / \u0E1A\u0E17\u0E04\u0E27\u0E32\u0E21)';
    displayName: 'Article';
    pluralName: 'articles';
    singularName: 'article';
  };
  options: {
    draftAndPublish: true;
  };
  pluginOptions: {
    i18n: {
      localized: true;
    };
  };
  attributes: {
    body: Schema.Attribute.RichText &
      Schema.Attribute.CustomField<
        'plugin::ckeditor5.CKEditor',
        {
          preset: 'defaultHtml';
        }
      > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    categoryLabel: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    coverImage: Schema.Attribute.Media<'images'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    displayEnd: Schema.Attribute.DateTime &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    displayStart: Schema.Attribute.DateTime &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    excerpt: Schema.Attribute.Text &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    featured: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<false>;
    kind: Schema.Attribute.Enumeration<['news', 'article']> &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<'news'>;
    locale: Schema.Attribute.String;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::article.article'
    >;
    publishDate: Schema.Attribute.Date &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    publishedAt: Schema.Attribute.DateTime;
    related: Schema.Attribute.Relation<'manyToMany', 'api::article.article'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    slug: Schema.Attribute.UID<'title'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    tags: Schema.Attribute.JSON &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    views: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<0>;
  };
}

export interface ApiAuditLogAuditLog extends Struct.CollectionTypeSchema {
  collectionName: 'audit_logs';
  info: {
    description: 'Admin action audit trail (admin-only)';
    displayName: 'Audit Log';
    pluralName: 'audit-logs';
    singularName: 'audit-log';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    action: Schema.Attribute.String;
    actor: Schema.Attribute.String;
    adminEmail: Schema.Attribute.String;
    at: Schema.Attribute.DateTime;
    contentType: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    entryId: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::audit-log.audit-log'
    > &
      Schema.Attribute.Private;
    method: Schema.Attribute.String;
    path: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    targetRef: Schema.Attribute.String;
    tenantKey: Schema.Attribute.String;
    tokens: Schema.Attribute.Integer;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiAwardAward extends Struct.CollectionTypeSchema {
  collectionName: 'awards';
  info: {
    description: '\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25 DGA Auditorium';
    displayName: 'Award';
    pluralName: 'awards';
    singularName: 'award';
  };
  options: {
    draftAndPublish: true;
  };
  pluginOptions: {
    i18n: {
      localized: true;
    };
  };
  attributes: {
    categoryText: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    image: Schema.Attribute.Media<'images'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    locale: Schema.Attribute.String;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::award.award'>;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    order: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    year: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
  };
}

export interface ApiBannerBanner extends Struct.CollectionTypeSchema {
  collectionName: 'banners';
  info: {
    description: '\u0E41\u0E1A\u0E19\u0E40\u0E19\u0E2D\u0E23\u0E4C\u0E44\u0E2E\u0E44\u0E25\u0E15\u0E4C\u0E1B\u0E23\u0E30\u0E0A\u0E32\u0E2A\u0E31\u0E21\u0E1E\u0E31\u0E19\u0E18\u0E4C (carousel \u0E2B\u0E19\u0E49\u0E32\u0E41\u0E23\u0E01)';
    displayName: 'Banner';
    pluralName: 'banners';
    singularName: 'banner';
  };
  options: {
    draftAndPublish: true;
  };
  pluginOptions: {
    i18n: {
      localized: true;
    };
  };
  attributes: {
    active: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<true>;
    clicks: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<0>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    image: Schema.Attribute.Media<'images'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    impressions: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<0>;
    label: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    locale: Schema.Attribute.String;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::banner.banner'>;
    order: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<'#'>;
  };
}

export interface ApiBlockTypeBlockType extends Struct.CollectionTypeSchema {
  collectionName: 'block_types';
  info: {
    description: '\u0E19\u0E34\u0E22\u0E32\u0E21\u0E1A\u0E25\u0E47\u0E2D\u0E01\u0E17\u0E35\u0E48\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E40\u0E2D\u0E07 (no-code custom blocks) \u0E43\u0E0A\u0E49\u0E01\u0E31\u0E1A Visual Builder';
    displayName: 'Block Type';
    pluralName: 'block-types';
    singularName: 'block-type';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    fieldsSchema: Schema.Attribute.JSON;
    icon: Schema.Attribute.String;
    key: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::block-type.block-type'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    template: Schema.Attribute.Text;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    visualElements: Schema.Attribute.JSON;
  };
}

export interface ApiBlogBlog extends Struct.CollectionTypeSchema {
  collectionName: 'blogs';
  info: {
    description: '\u0E1A\u0E25\u0E47\u0E2D\u0E01 (TOR \u0E20\u0E32\u0E04\u0E1C\u0E19\u0E27\u0E01 \u0E01 \u0E02\u0E49\u0E2D 15)';
    displayName: 'Blog';
    pluralName: 'blogs';
    singularName: 'blog';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    author: Schema.Attribute.String;
    body: Schema.Attribute.RichText &
      Schema.Attribute.CustomField<
        'plugin::ckeditor5.CKEditor',
        {
          preset: 'defaultHtml';
        }
      >;
    category: Schema.Attribute.String;
    coverImage: Schema.Attribute.Media<'images'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    excerpt: Schema.Attribute.Text;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::blog.blog'> &
      Schema.Attribute.Private;
    publishDate: Schema.Attribute.Date;
    publishedAt: Schema.Attribute.DateTime;
    slug: Schema.Attribute.UID<'title'>;
    tags: Schema.Attribute.JSON;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    views: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
  };
}

export interface ApiBreakingNewsBreakingNews
  extends Struct.CollectionTypeSchema {
  collectionName: 'breaking_news_alerts';
  info: {
    description: '\u0E1B\u0E23\u0E30\u0E01\u0E32\u0E28\u0E14\u0E48\u0E27\u0E19 (TOR \u2014 a fast-publish path that skips the public-site static rebuild entirely: the banner is fetched live by the browser, not baked into build output, so toggling it live is a normal Strapi publish, not a 20s-debounced multi-minute site rebuild). At most one row per tenant by convention, enforced by the editor UI, not the schema.';
    displayName: 'Breaking News Alert';
    pluralName: 'breaking-news-alerts';
    singularName: 'breaking-news';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    linkLabel: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'\u0E2D\u0E48\u0E32\u0E19\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::breaking-news.breaking-news'
    > &
      Schema.Attribute.Private;
    message: Schema.Attribute.Text & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    severity: Schema.Attribute.Enumeration<['info', 'warning', 'critical']> &
      Schema.Attribute.DefaultTo<'warning'>;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.String;
  };
}

export interface ApiCatalogCatalog extends Struct.CollectionTypeSchema {
  collectionName: 'catalogs';
  info: {
    description: '\u0E41\u0E04\u0E15\u0E15\u0E32\u0E25\u0E47\u0E2D\u0E01\u0E2D\u0E34\u0E40\u0E25\u0E47\u0E01\u0E17\u0E23\u0E2D\u0E19\u0E34\u0E01\u0E2A\u0E4C (TOR \u0E20\u0E32\u0E04\u0E1C\u0E19\u0E27\u0E01 \u0E01 \u0E02\u0E49\u0E2D 19)';
    displayName: 'Catalog (e-catalog)';
    pluralName: 'catalogs';
    singularName: 'catalog';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    category: Schema.Attribute.String;
    coverImage: Schema.Attribute.Media<'images'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    file: Schema.Attribute.Media<'files' | 'images'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::catalog.catalog'
    > &
      Schema.Attribute.Private;
    order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiComplaintComplaint extends Struct.CollectionTypeSchema {
  collectionName: 'complaints';
  info: {
    description: '\u0E40\u0E23\u0E37\u0E48\u0E2D\u0E07\u0E23\u0E49\u0E2D\u0E07\u0E40\u0E23\u0E35\u0E22\u0E19/\u0E02\u0E49\u0E2D\u0E40\u0E2A\u0E19\u0E2D\u0E41\u0E19\u0E30 (\u0E23\u0E31\u0E1A\u0E08\u0E32\u0E01\u0E1F\u0E2D\u0E23\u0E4C\u0E21\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E30)';
    displayName: 'Complaint';
    pluralName: 'complaints';
    singularName: 'complaint';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    agency: Schema.Attribute.String;
    anonymous: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    attachment: Schema.Attribute.Media<'images' | 'files'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.String;
    detail: Schema.Attribute.Text;
    email: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::complaint.complaint'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    phone: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    ref: Schema.Attribute.String & Schema.Attribute.Unique;
    stage: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 3;
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    steps: Schema.Attribute.JSON;
    subject: Schema.Attribute.String;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    type: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiConsentLogConsentLog extends Struct.CollectionTypeSchema {
  collectionName: 'consent_logs';
  info: {
    description: '\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E01\u0E32\u0E23\u0E43\u0E2B\u0E49\u0E04\u0E27\u0E32\u0E21\u0E22\u0E34\u0E19\u0E22\u0E2D\u0E21\u0E04\u0E38\u0E01\u0E01\u0E35\u0E49 (PDPA) \u2014 \u0E40\u0E01\u0E47\u0E1A\u0E44\u0E27\u0E49\u0E40\u0E1B\u0E47\u0E19\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19';
    displayName: 'Consent Log';
    pluralName: 'consent-logs';
    singularName: 'consent-log';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    action: Schema.Attribute.String;
    categories: Schema.Attribute.JSON;
    consentId: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    language: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::consent-log.consent-log'
    > &
      Schema.Attribute.Private;
    path: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    userAgent: Schema.Attribute.Text;
  };
}

export interface ApiContactMessageContactMessage
  extends Struct.CollectionTypeSchema {
  collectionName: 'contact_messages';
  info: {
    description: '\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E15\u0E34\u0E14\u0E15\u0E48\u0E2D\u0E08\u0E32\u0E01\u0E41\u0E1A\u0E1A\u0E1F\u0E2D\u0E23\u0E4C\u0E21 Contact Us (TOR \u0E20\u0E32\u0E04\u0E1C\u0E19\u0E27\u0E01 \u0E01 \u0E02\u0E49\u0E2D 11.2)';
    displayName: 'Contact Message';
    pluralName: 'contact-messages';
    singularName: 'contact-message';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email;
    handled: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::contact-message.contact-message'
    > &
      Schema.Attribute.Private;
    message: Schema.Attribute.Text & Schema.Attribute.Required;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    phone: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    subject: Schema.Attribute.String;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiCustomRoleCustomRole extends Struct.CollectionTypeSchema {
  collectionName: 'custom_roles';
  info: {
    description: 'WebX-owned, tenant-scoped custom role \u2014 per-content-type action + field permissions. Not a real Strapi admin::role.';
    displayName: 'Custom Role';
    pluralName: 'custom-roles';
    singularName: 'custom-role';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::custom-role.custom-role'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    permissions: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    roleKey: Schema.Attribute.String & Schema.Attribute.Required;
    tenantKey: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiDocEmbeddingDocEmbedding
  extends Struct.CollectionTypeSchema {
  collectionName: 'doc_embeddings';
  info: {
    description: 'Vector index of tenant content for RAG/semantic search (admin-only)';
    displayName: 'Doc Embedding';
    pluralName: 'doc-embeddings';
    singularName: 'doc-embedding';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    contentType: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    documentRef: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::doc-embedding.doc-embedding'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    tenantKey: Schema.Attribute.String;
    text: Schema.Attribute.Text;
    title: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.String;
    vector: Schema.Attribute.JSON;
  };
}

export interface ApiDownloadDownload extends Struct.CollectionTypeSchema {
  collectionName: 'downloads';
  info: {
    description: '\u0E28\u0E39\u0E19\u0E22\u0E4C\u0E14\u0E32\u0E27\u0E19\u0E4C\u0E42\u0E2B\u0E25\u0E14\u0E40\u0E2D\u0E01\u0E2A\u0E32\u0E23/\u0E41\u0E1A\u0E1A\u0E1F\u0E2D\u0E23\u0E4C\u0E21';
    displayName: 'Download';
    pluralName: 'downloads';
    singularName: 'download';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    category: Schema.Attribute.String;
    contentText: Schema.Attribute.Text & Schema.Attribute.Configurable;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    downloads: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    file: Schema.Attribute.Media<'files' | 'images'>;
    fileSize: Schema.Attribute.String;
    fileType: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::download.download'
    > &
      Schema.Attribute.Private;
    order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiEbookEbook extends Struct.CollectionTypeSchema {
  collectionName: 'ebooks';
  info: {
    description: '\u0E2B\u0E19\u0E31\u0E07\u0E2A\u0E37\u0E2D\u0E2D\u0E34\u0E40\u0E25\u0E47\u0E01\u0E17\u0E23\u0E2D\u0E19\u0E34\u0E01\u0E2A\u0E4C / \u0E2A\u0E34\u0E48\u0E07\u0E1E\u0E34\u0E21\u0E1E\u0E4C';
    displayName: 'E-book';
    pluralName: 'ebooks';
    singularName: 'ebook';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    author: Schema.Attribute.String;
    contentText: Schema.Attribute.Text;
    cover: Schema.Attribute.Media<'images'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    file: Schema.Attribute.Media<'files'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::ebook.ebook'> &
      Schema.Attribute.Private;
    order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    reference: Schema.Attribute.String;
    referenceDate: Schema.Attribute.Date;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    year: Schema.Attribute.String;
  };
}

export interface ApiEventEvent extends Struct.CollectionTypeSchema {
  collectionName: 'events';
  info: {
    description: '\u0E1B\u0E0F\u0E34\u0E17\u0E34\u0E19\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21 (TOR \u0E20\u0E32\u0E04\u0E1C\u0E19\u0E27\u0E01 \u0E01 \u0E02\u0E49\u0E2D 16)';
    displayName: 'Event (\u0E1B\u0E0F\u0E34\u0E17\u0E34\u0E19\u0E01\u0E34\u0E08\u0E01\u0E23\u0E23\u0E21)';
    pluralName: 'events';
    singularName: 'event';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    allDay: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    category: Schema.Attribute.String;
    color: Schema.Attribute.Enumeration<
      ['blue', 'amber', 'green', 'purple', 'red']
    > &
      Schema.Attribute.DefaultTo<'blue'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    end: Schema.Attribute.DateTime;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::event.event'> &
      Schema.Attribute.Private;
    location: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    start: Schema.Attribute.DateTime & Schema.Attribute.Required;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiFaqFaq extends Struct.CollectionTypeSchema {
  collectionName: 'faqs';
  info: {
    description: '\u0E04\u0E33\u0E16\u0E32\u0E21\u0E17\u0E35\u0E48\u0E1E\u0E1A\u0E1A\u0E48\u0E2D\u0E22 (Answer Engine / AEO)';
    displayName: 'FAQ';
    pluralName: 'faqs';
    singularName: 'faq';
  };
  options: {
    draftAndPublish: true;
  };
  pluginOptions: {
    i18n: {
      localized: true;
    };
  };
  attributes: {
    answer: Schema.Attribute.Text &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::faq.faq'>;
    order: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    question: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    views: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<0>;
  };
}

export interface ApiFieldPolicyFieldPolicy extends Struct.CollectionTypeSchema {
  collectionName: 'field_policies';
  info: {
    description: 'Per-role field access (hidden / read-only) for content types';
    displayName: 'Field Policy';
    pluralName: 'field-policies';
    singularName: 'field-policy';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    contentType: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    hidden: Schema.Attribute.JSON;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::field-policy.field-policy'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    readonly: Schema.Attribute.JSON;
    role: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiGalleryGallery extends Struct.CollectionTypeSchema {
  collectionName: 'galleries';
  info: {
    description: '\u0E2D\u0E31\u0E25\u0E1A\u0E31\u0E49\u0E21\u0E20\u0E32\u0E1E (Photo Gallery)';
    displayName: 'Gallery';
    pluralName: 'galleries';
    singularName: 'gallery';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    coverImage: Schema.Attribute.Media<'images'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.Date;
    description: Schema.Attribute.Text;
    images: Schema.Attribute.Media<'images', true>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::gallery.gallery'
    > &
      Schema.Attribute.Private;
    order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    views: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
  };
}

export interface ApiHomePageHomePage extends Struct.CollectionTypeSchema {
  collectionName: 'home_pages';
  info: {
    description: '\u0E40\u0E19\u0E37\u0E49\u0E2D\u0E2B\u0E32\u0E2B\u0E19\u0E49\u0E32\u0E41\u0E23\u0E01 (Hero, \u0E2A\u0E16\u0E34\u0E15\u0E34, \u0E42\u0E1B\u0E23\u0E42\u0E21\u0E17\u0E40\u0E14\u0E48\u0E19) \u2014 1 \u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E15\u0E48\u0E2D tenant';
    displayName: 'Home Page';
    pluralName: 'home-pages';
    singularName: 'home-page';
  };
  options: {
    draftAndPublish: true;
  };
  pluginOptions: {
    i18n: {
      localized: true;
    };
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    featuredPromo: Schema.Attribute.Component<'home.featured-promo', false> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    hero: Schema.Attribute.Component<'home.hero', false> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    locale: Schema.Attribute.String;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::home-page.home-page'
    >;
    publishedAt: Schema.Attribute.DateTime;
    seoDescription: Schema.Attribute.Text &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    seoTitle: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    stats: Schema.Attribute.Component<'home.stat', true> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiIconIcon extends Struct.CollectionTypeSchema {
  collectionName: 'icons';
  info: {
    description: '\u0E44\u0E2D\u0E04\u0E2D\u0E19\u0E17\u0E35\u0E48\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E2D\u0E31\u0E1B\u0E42\u0E2B\u0E25\u0E14\u0E40\u0E2D\u0E07 (no-code) \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A Feature grid / Stat row \u0E43\u0E19 Visual Builder';
    displayName: 'Icon';
    pluralName: 'icons';
    singularName: 'icon';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    image: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    key: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::icon.icon'> &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiJobJob extends Struct.CollectionTypeSchema {
  collectionName: 'jobs';
  info: {
    description: '\u0E15\u0E33\u0E41\u0E2B\u0E19\u0E48\u0E07\u0E07\u0E32\u0E19 (\u0E23\u0E48\u0E27\u0E21\u0E07\u0E32\u0E19\u0E01\u0E31\u0E1A \u0E2A\u0E1E\u0E23.)';
    displayName: 'Job';
    pluralName: 'jobs';
    singularName: 'job';
  };
  options: {
    draftAndPublish: true;
  };
  pluginOptions: {
    i18n: {
      localized: true;
    };
  };
  attributes: {
    benefits: Schema.Attribute.JSON &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    deadline: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    dept: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    deptKey: Schema.Attribute.Enumeration<
      ['tech', 'data', 'design', 'security', 'pm', 'corporate']
    > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<'tech'>;
    jobId: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    locale: Schema.Attribute.String;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::job.job'>;
    location: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    openings: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<1>;
    publishedAt: Schema.Attribute.DateTime;
    qualifications: Schema.Attribute.JSON &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    responsibilities: Schema.Attribute.JSON &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    salary: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    summary: Schema.Attribute.Text &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    type: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    typeKey: Schema.Attribute.Enumeration<
      ['fulltime', 'contract', 'internship']
    > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<'fulltime'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiLandingLanding extends Struct.CollectionTypeSchema {
  collectionName: 'landings';
  info: {
    description: '\u0E2B\u0E19\u0E49\u0E32 Landing/Splash \u0E2A\u0E23\u0E49\u0E32\u0E07\u0E41\u0E1A\u0E1A no-code \u0E14\u0E49\u0E27\u0E22\u0E01\u0E32\u0E23\u0E27\u0E32\u0E07\u0E1A\u0E25\u0E47\u0E2D\u0E01 (Dynamic Zone)';
    displayName: 'Landing';
    pluralName: 'landings';
    singularName: 'landing';
  };
  options: {
    draftAndPublish: true;
  };
  pluginOptions: {
    i18n: {
      localized: true;
    };
  };
  attributes: {
    abEnabled: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<false>;
    abSplit: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.SetMinMax<
        {
          max: 100;
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<50>;
    active: Schema.Attribute.Boolean &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<true>;
    blocks: Schema.Attribute.DynamicZone<
      [
        'block.hero',
        'block.richtext',
        'block.image',
        'block.cta-banner',
        'block.feature-grid',
        'block.custom',
        'block.embed',
        'block.collection-list',
        'block.form',
        'block.testimonials',
        'block.logo-cloud',
        'block.spacer',
        'block.blockquote',
        'block.team-grid',
        'block.tabs',
        'block.comparison',
      ]
    > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    enterSiteLabel: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    enterSiteUrl: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<'index.html'>;
    locale: Schema.Attribute.String;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::landing.landing'
    >;
    publishedAt: Schema.Attribute.DateTime;
    publishEnd: Schema.Attribute.DateTime &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    publishStart: Schema.Attribute.DateTime &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    seoDescription: Schema.Attribute.Text &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    slug: Schema.Attribute.UID<'title'> &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    variantBlocks: Schema.Attribute.JSON &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
  };
}

export interface ApiLocationLocation extends Struct.CollectionTypeSchema {
  collectionName: 'locations';
  info: {
    description: '\u0E08\u0E38\u0E14\u0E17\u0E35\u0E48\u0E15\u0E31\u0E49\u0E07\u0E1A\u0E19\u0E41\u0E1C\u0E19\u0E17\u0E35\u0E48 (TOR \u0E20\u0E32\u0E04\u0E1C\u0E19\u0E27\u0E01 \u0E01 \u0E02\u0E49\u0E2D 27)';
    displayName: 'Location (Map)';
    pluralName: 'locations';
    singularName: 'location';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    address: Schema.Attribute.Text;
    category: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    lat: Schema.Attribute.Float & Schema.Attribute.Required;
    lng: Schema.Attribute.Float & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::location.location'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    phone: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiMenuItemMenuItem extends Struct.CollectionTypeSchema {
  collectionName: 'menu_items';
  info: {
    description: '\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E21\u0E19\u0E39\u0E2B\u0E25\u0E31\u0E01 (mega-menu) \u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E1C\u0E48\u0E32\u0E19 CMS (TOR \u0E02\u0E49\u0E2D 4.1)';
    displayName: 'Menu Item';
    pluralName: 'menu-items';
    singularName: 'menu-item';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    column: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    label: Schema.Attribute.String & Schema.Attribute.Required;
    labelEn: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::menu-item.menu-item'
    > &
      Schema.Attribute.Private;
    megaMenu: Schema.Attribute.JSON;
    menu: Schema.Attribute.Enumeration<
      ['service', 'news', 'eservice', 'about']
    >;
    openNewTab: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.String & Schema.Attribute.DefaultTo<'#'>;
  };
}

export interface ApiMfaEnrollmentMfaEnrollment
  extends Struct.CollectionTypeSchema {
  collectionName: 'mfa_enrollments';
  info: {
    description: "Per-admin TOTP secret + recovery codes for webx-studio's own login MFA (not Strapi's admin-panel-only demo gate)";
    displayName: 'MFA Enrollment';
    pluralName: 'mfa-enrollments';
    singularName: 'mfa-enrollment';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    adminEmail: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    enabled: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::mfa-enrollment.mfa-enrollment'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    recoveryCodesHash: Schema.Attribute.JSON & Schema.Attribute.Private;
    recoveryCodesUsed: Schema.Attribute.JSON & Schema.Attribute.Private;
    secret: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPageTemplatePageTemplate
  extends Struct.CollectionTypeSchema {
  collectionName: 'page_templates';
  info: {
    description: '\u0E0A\u0E38\u0E14\u0E1A\u0E25\u0E47\u0E2D\u0E01\u0E17\u0E31\u0E49\u0E07\u0E2B\u0E19\u0E49\u0E32\u0E17\u0E35\u0E48\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E44\u0E27\u0E49\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E19\u0E33\u0E44\u0E1B\u0E43\u0E0A\u0E49\u0E0B\u0E49\u0E33 (Save as template \u0E43\u0E19 Visual Builder)';
    displayName: 'Page Template';
    pluralName: 'page-templates';
    singularName: 'page-template';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    blocks: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    dialect: Schema.Attribute.String & Schema.Attribute.DefaultTo<'gov-portal'>;
    key: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::page-template.page-template'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    tenantKey: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPageVersionPageVersion extends Struct.CollectionTypeSchema {
  collectionName: 'page_versions';
  info: {
    description: "Immutable snapshots of a page's blocks for version history / restore";
    displayName: 'Page Version';
    pluralName: 'page-versions';
    singularName: 'page-version';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    author: Schema.Attribute.String;
    contentType: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    data: Schema.Attribute.JSON;
    documentRef: Schema.Attribute.String & Schema.Attribute.Required;
    label: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::page-version.page-version'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    tenantKey: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPagePage extends Struct.CollectionTypeSchema {
  collectionName: 'pages';
  info: {
    description: '\u0E2B\u0E19\u0E49\u0E32\u0E40\u0E27\u0E47\u0E1A\u0E17\u0E31\u0E48\u0E27\u0E44\u0E1B\u0E17\u0E35\u0E48\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E41\u0E1A\u0E1A no-code \u0E14\u0E49\u0E27\u0E22\u0E01\u0E32\u0E23\u0E27\u0E32\u0E07\u0E1A\u0E25\u0E47\u0E2D\u0E01 (Dynamic Zone)';
    displayName: 'Page';
    pluralName: 'pages';
    singularName: 'page';
  };
  options: {
    draftAndPublish: true;
  };
  pluginOptions: {
    i18n: {
      localized: true;
    };
  };
  attributes: {
    blocks: Schema.Attribute.DynamicZone<
      [
        'block.hero',
        'block.richtext',
        'block.image',
        'block.cta-banner',
        'block.feature-grid',
        'block.custom',
        'block.highlights',
        'block.stat-row',
        'block.news-panel',
        'block.video-channel',
        'block.awards',
        'block.faq',
        'block.featured-promo',
        'block.embed',
        'block.collection-list',
        'block.form',
        'block.testimonials',
        'block.logo-cloud',
        'block.spacer',
        'block.blockquote',
        'block.team-grid',
        'block.tabs',
        'block.comparison',
      ]
    > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::page.page'>;
    publishedAt: Schema.Attribute.DateTime;
    seoDescription: Schema.Attribute.Text &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    slug: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPollPoll extends Struct.CollectionTypeSchema {
  collectionName: 'polls';
  info: {
    description: '\u0E42\u0E1E\u0E25/\u0E41\u0E1A\u0E1A\u0E2A\u0E33\u0E23\u0E27\u0E08\u0E04\u0E27\u0E32\u0E21\u0E04\u0E34\u0E14\u0E40\u0E2B\u0E47\u0E19 (Vote)';
    displayName: 'Poll';
    pluralName: 'polls';
    singularName: 'poll';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::poll.poll'> &
      Schema.Attribute.Private;
    options: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    question: Schema.Attribute.String & Schema.Attribute.Required;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    totalVotes: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiPopupPopup extends Struct.CollectionTypeSchema {
  collectionName: 'popups';
  info: {
    description: '\u0E1B\u0E4A\u0E2D\u0E1B\u0E2D\u0E31\u0E1B/\u0E1B\u0E23\u0E30\u0E01\u0E32\u0E28 \u0E41\u0E2A\u0E14\u0E07\u0E1A\u0E19\u0E2B\u0E19\u0E49\u0E32\u0E40\u0E27\u0E47\u0E1A';
    displayName: 'Popup';
    pluralName: 'popups';
    singularName: 'popup';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    body: Schema.Attribute.Text;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    image: Schema.Attribute.Media<'images'>;
    linkLabel: Schema.Attribute.String;
    linkUrl: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::popup.popup'> &
      Schema.Attribute.Private;
    priority: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiRegistrationRegistration
  extends Struct.CollectionTypeSchema {
  collectionName: 'registrations';
  info: {
    description: '\u0E04\u0E33\u0E02\u0E2D\u0E25\u0E07\u0E17\u0E30\u0E40\u0E1A\u0E35\u0E22\u0E19\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E23\u0E30\u0E1A\u0E1A (\u0E44\u0E21\u0E48\u0E40\u0E01\u0E47\u0E1A\u0E23\u0E2B\u0E31\u0E2A\u0E1C\u0E48\u0E32\u0E19)';
    displayName: 'Registration';
    pluralName: 'registrations';
    singularName: 'registration';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.String;
    extra: Schema.Attribute.JSON;
    firstname: Schema.Attribute.String;
    lastname: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::registration.registration'
    > &
      Schema.Attribute.Private;
    nidMasked: Schema.Attribute.String;
    phone: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    username: Schema.Attribute.String & Schema.Attribute.Unique;
    utype: Schema.Attribute.String;
    verified: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
  };
}

export interface ApiReleaseRelease extends Struct.CollectionTypeSchema {
  collectionName: 'releases';
  info: {
    description: 'Group entries and publish them together, now or scheduled';
    displayName: 'Release';
    pluralName: 'releases';
    singularName: 'release';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    items: Schema.Attribute.JSON;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::release.release'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    note: Schema.Attribute.Text;
    publishedAt: Schema.Attribute.DateTime;
    scheduledAt: Schema.Attribute.DateTime;
    state: Schema.Attribute.String & Schema.Attribute.DefaultTo<'draft'>;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiReviewReview extends Struct.CollectionTypeSchema {
  collectionName: 'reviews';
  info: {
    description: 'Content review/approval workflow state per entry';
    displayName: 'Review';
    pluralName: 'reviews';
    singularName: 'review';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    assignee: Schema.Attribute.String;
    contentType: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    documentRef: Schema.Attribute.String & Schema.Attribute.Required;
    history: Schema.Attribute.JSON;
    kind: Schema.Attribute.String & Schema.Attribute.DefaultTo<'review'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::review.review'
    > &
      Schema.Attribute.Private;
    note: Schema.Attribute.Text;
    payload: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    requestedBy: Schema.Attribute.String;
    stage: Schema.Attribute.String & Schema.Attribute.DefaultTo<'in_review'>;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    title: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiServiceService extends Struct.CollectionTypeSchema {
  collectionName: 'services';
  info: {
    description: '\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23\u0E22\u0E2D\u0E14\u0E19\u0E34\u0E22\u0E21 (\u0E01\u0E32\u0E23\u0E4C\u0E14\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23\u0E1A\u0E19\u0E2B\u0E19\u0E49\u0E32\u0E41\u0E23\u0E01)';
    displayName: 'Service';
    pluralName: 'services';
    singularName: 'service';
  };
  options: {
    draftAndPublish: true;
  };
  pluginOptions: {
    i18n: {
      localized: true;
    };
  };
  attributes: {
    colorTheme: Schema.Attribute.Enumeration<
      ['orange', 'blue', 'green', 'amber', 'purple', 'teal']
    > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<'blue'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
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
      ]
    > &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<'i-grid'>;
    locale: Schema.Attribute.String;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::service.service'
    >;
    order: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<'#'>;
  };
}

export interface ApiSitemapNodeSitemapNode extends Struct.CollectionTypeSchema {
  collectionName: 'sitemap_nodes';
  info: {
    description: '\u0E42\u0E04\u0E23\u0E07\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E41\u0E1C\u0E19\u0E1C\u0E31\u0E07\u0E40\u0E27\u0E47\u0E1A\u0E44\u0E0B\u0E15\u0E4C (TOR \u0E20\u0E32\u0E04\u0E1C\u0E19\u0E27\u0E01 \u0E01 \u0E02\u0E49\u0E2D 25)';
    displayName: 'Sitemap Node';
    pluralName: 'sitemap-nodes';
    singularName: 'sitemap-node';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    group: Schema.Attribute.String & Schema.Attribute.Required;
    label: Schema.Attribute.String & Schema.Attribute.Required;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::sitemap-node.sitemap-node'
    > &
      Schema.Attribute.Private;
    order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.String;
  };
}

export interface ApiSsoCredentialSsoCredential
  extends Struct.CollectionTypeSchema {
  collectionName: 'sso_credentials';
  info: {
    description: 'Per-user JIT-provisioned Strapi admin shadow password for SSO logins (Strapi CE has no native admin SSO). Encrypted at rest.';
    displayName: 'SSO Credential';
    pluralName: 'sso-credentials';
    singularName: 'sso-credential';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    adminEmail: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::sso-credential.sso-credential'
    > &
      Schema.Attribute.Private;
    passwordEnc: Schema.Attribute.Text &
      Schema.Attribute.Required &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    strapiUserId: Schema.Attribute.String & Schema.Attribute.Private;
    tenantKey: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiTenantTenant extends Struct.CollectionTypeSchema {
  collectionName: 'tenants';
  info: {
    description: '\u0E2B\u0E19\u0E48\u0E27\u0E22\u0E07\u0E32\u0E19/\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32 (multi-tenant) + \u0E15\u0E31\u0E49\u0E07\u0E04\u0E48\u0E32\u0E41\u0E1A\u0E23\u0E19\u0E14\u0E4C/\u0E40\u0E21\u0E19\u0E39/footer \u0E15\u0E48\u0E2D tenant';
    displayName: 'Tenant';
    pluralName: 'tenants';
    singularName: 'tenant';
  };
  options: {
    draftAndPublish: false;
  };
  attributes: {
    active: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    adminEmails: Schema.Attribute.JSON;
    analytics: Schema.Attribute.JSON;
    brand: Schema.Attribute.JSON;
    contact: Schema.Attribute.JSON;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    customRoleAssignments: Schema.Attribute.JSON;
    domains: Schema.Attribute.JSON;
    engine: Schema.Attribute.Enumeration<['strapi', 'wordpress']> &
      Schema.Attribute.DefaultTo<'strapi'>;
    features: Schema.Attribute.JSON;
    footerColumns: Schema.Attribute.JSON;
    key: Schema.Attribute.UID & Schema.Attribute.Required;
    liveChat: Schema.Attribute.JSON;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::tenant.tenant'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    plan: Schema.Attribute.Enumeration<['free', 'pro', 'enterprise']> &
      Schema.Attribute.DefaultTo<'free'>;
    publicTemplate: Schema.Attribute.Enumeration<
      ['gov-portal', 'orst', 'royalsociety']
    > &
      Schema.Attribute.DefaultTo<'gov-portal'>;
    publishedAt: Schema.Attribute.DateTime;
    seats: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<3>;
    social: Schema.Attribute.JSON;
    sso: Schema.Attribute.JSON;
    subscriptionStatus: Schema.Attribute.String &
      Schema.Attribute.DefaultTo<'active'>;
    template: Schema.Attribute.JSON;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    watermark: Schema.Attribute.JSON;
  };
}

export interface ApiTopGraphicTopGraphic extends Struct.CollectionTypeSchema {
  collectionName: 'top_graphics';
  info: {
    description: '\u0E20\u0E32\u0E1E\u0E01\u0E23\u0E32\u0E1F\u0E34\u0E01\u0E14\u0E49\u0E32\u0E19\u0E1A\u0E19 (TOR \u0E20\u0E32\u0E04\u0E1C\u0E19\u0E27\u0E01 \u0E01 \u0E02\u0E49\u0E2D 24)';
    displayName: 'Top Graphic';
    pluralName: 'top-graphics';
    singularName: 'top-graphic';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    endDate: Schema.Attribute.Date;
    image: Schema.Attribute.Media<'images'>;
    linkUrl: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::top-graphic.top-graphic'
    > &
      Schema.Attribute.Private;
    order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    startDate: Schema.Attribute.Date;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    title: Schema.Attribute.String;
    transition: Schema.Attribute.Enumeration<['fade', 'slide', 'none']> &
      Schema.Attribute.DefaultTo<'fade'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface ApiVideoVideo extends Struct.CollectionTypeSchema {
  collectionName: 'videos';
  info: {
    description: '\u0E27\u0E34\u0E14\u0E35\u0E42\u0E2D DGA Channel';
    displayName: 'Video';
    pluralName: 'videos';
    singularName: 'video';
  };
  options: {
    draftAndPublish: true;
  };
  pluginOptions: {
    i18n: {
      localized: true;
    };
  };
  attributes: {
    categoryKey: Schema.Attribute.Enumeration<['std', 'event', 'talk']> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<'std'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    date: Schema.Attribute.Date &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    duration: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    locale: Schema.Attribute.String;
    localizations: Schema.Attribute.Relation<'oneToMany', 'api::video.video'>;
    publishedAt: Schema.Attribute.DateTime;
    subtitles: Schema.Attribute.Media<'files'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    thumbnail: Schema.Attribute.Media<'images'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    title: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: true;
        };
      }>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    videoFile: Schema.Attribute.Media<'videos'> &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    videoUrl: Schema.Attribute.String &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }>;
    views: Schema.Attribute.Integer &
      Schema.Attribute.SetPluginOptions<{
        i18n: {
          localized: false;
        };
      }> &
      Schema.Attribute.DefaultTo<0>;
  };
}

export interface ApiWeblinkWeblink extends Struct.CollectionTypeSchema {
  collectionName: 'weblinks';
  info: {
    description: '\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23\u0E40\u0E27\u0E47\u0E1A\u0E25\u0E34\u0E07\u0E01\u0E4C (TOR \u0E20\u0E32\u0E04\u0E1C\u0E19\u0E27\u0E01 \u0E01 \u0E02\u0E49\u0E2D 23)';
    displayName: 'Web Link';
    pluralName: 'weblinks';
    singularName: 'weblink';
  };
  options: {
    draftAndPublish: true;
  };
  attributes: {
    category: Schema.Attribute.String;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.Text;
    displayType: Schema.Attribute.Enumeration<['image', 'text', 'button']> &
      Schema.Attribute.DefaultTo<'button'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'api::weblink.weblink'
    > &
      Schema.Attribute.Private;
    openNewTab: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<true>;
    order: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    publishedAt: Schema.Attribute.DateTime;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    thumbnail: Schema.Attribute.Media<'images'>;
    title: Schema.Attribute.String & Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface PluginContentReleasesRelease
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_releases';
  info: {
    displayName: 'Release';
    pluralName: 'releases';
    singularName: 'release';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    actions: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release-action'
    >;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    publishedAt: Schema.Attribute.DateTime;
    releasedAt: Schema.Attribute.DateTime;
    scheduledAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<
      ['ready', 'blocked', 'failed', 'done', 'empty']
    > &
      Schema.Attribute.Required;
    timezone: Schema.Attribute.String;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginContentReleasesReleaseAction
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_release_actions';
  info: {
    displayName: 'Release Action';
    pluralName: 'release-actions';
    singularName: 'release-action';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    contentType: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    entryDocumentId: Schema.Attribute.String;
    isEntryValid: Schema.Attribute.Boolean;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::content-releases.release-action'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    release: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::content-releases.release'
    >;
    type: Schema.Attribute.Enumeration<['publish', 'unpublish']> &
      Schema.Attribute.Required;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginI18NLocale extends Struct.CollectionTypeSchema {
  collectionName: 'i18n_locale';
  info: {
    collectionName: 'locales';
    description: '';
    displayName: 'Locale';
    pluralName: 'locales';
    singularName: 'locale';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    code: Schema.Attribute.String & Schema.Attribute.Unique;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::i18n.locale'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.SetMinMax<
        {
          max: 50;
          min: 1;
        },
        number
      >;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginReviewWorkflowsWorkflow
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_workflows';
  info: {
    description: '';
    displayName: 'Workflow';
    name: 'Workflow';
    pluralName: 'workflows';
    singularName: 'workflow';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    contentTypes: Schema.Attribute.JSON &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'[]'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    publishedAt: Schema.Attribute.DateTime;
    stageRequiredToPublish: Schema.Attribute.Relation<
      'oneToOne',
      'plugin::review-workflows.workflow-stage'
    >;
    stages: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow-stage'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginReviewWorkflowsWorkflowStage
  extends Struct.CollectionTypeSchema {
  collectionName: 'strapi_workflows_stages';
  info: {
    description: '';
    displayName: 'Stages';
    name: 'Workflow Stage';
    pluralName: 'workflow-stages';
    singularName: 'workflow-stage';
  };
  options: {
    draftAndPublish: false;
    version: '1.1.0';
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    color: Schema.Attribute.String & Schema.Attribute.DefaultTo<'#4945FF'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::review-workflows.workflow-stage'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String;
    permissions: Schema.Attribute.Relation<'manyToMany', 'admin::permission'>;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    workflow: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::review-workflows.workflow'
    >;
  };
}

export interface PluginUploadFile extends Struct.CollectionTypeSchema {
  collectionName: 'files';
  info: {
    description: '';
    displayName: 'File';
    pluralName: 'files';
    singularName: 'file';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    alternativeText: Schema.Attribute.Text;
    caption: Schema.Attribute.Text;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    ext: Schema.Attribute.String;
    focalPoint: Schema.Attribute.JSON;
    folder: Schema.Attribute.Relation<'manyToOne', 'plugin::upload.folder'> &
      Schema.Attribute.Private;
    folderPath: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    formats: Schema.Attribute.JSON;
    hash: Schema.Attribute.String & Schema.Attribute.Required;
    height: Schema.Attribute.Integer;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::upload.file'
    > &
      Schema.Attribute.Private;
    mime: Schema.Attribute.String & Schema.Attribute.Required;
    name: Schema.Attribute.String & Schema.Attribute.Required;
    previewUrl: Schema.Attribute.Text;
    provider: Schema.Attribute.String & Schema.Attribute.Required;
    provider_metadata: Schema.Attribute.JSON;
    publishedAt: Schema.Attribute.DateTime;
    related: Schema.Attribute.Relation<'morphToMany'>;
    size: Schema.Attribute.Decimal & Schema.Attribute.Required;
    tags: Schema.Attribute.String;
    tenant: Schema.Attribute.Relation<'manyToOne', 'api::tenant.tenant'>;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    url: Schema.Attribute.Text & Schema.Attribute.Required;
    width: Schema.Attribute.Integer;
  };
}

export interface PluginUploadFolder extends Struct.CollectionTypeSchema {
  collectionName: 'upload_folders';
  info: {
    displayName: 'Folder';
    pluralName: 'folders';
    singularName: 'folder';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    children: Schema.Attribute.Relation<'oneToMany', 'plugin::upload.folder'>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    files: Schema.Attribute.Relation<'oneToMany', 'plugin::upload.file'>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::upload.folder'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    parent: Schema.Attribute.Relation<'manyToOne', 'plugin::upload.folder'>;
    path: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 1;
      }>;
    pathId: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    publishedAt: Schema.Attribute.DateTime;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginUsersPermissionsPermission
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_permissions';
  info: {
    description: '';
    displayName: 'Permission';
    name: 'permission';
    pluralName: 'permissions';
    singularName: 'permission';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    action: Schema.Attribute.String & Schema.Attribute.Required;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.permission'
    > &
      Schema.Attribute.Private;
    publishedAt: Schema.Attribute.DateTime;
    role: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
  };
}

export interface PluginUsersPermissionsRole
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_roles';
  info: {
    description: '';
    displayName: 'Role';
    name: 'role';
    pluralName: 'roles';
    singularName: 'role';
  };
  options: {
    draftAndPublish: false;
  };
  pluginOptions: {
    'content-manager': {
      visible: false;
    };
    'content-type-builder': {
      visible: false;
    };
  };
  attributes: {
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    description: Schema.Attribute.String;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.role'
    > &
      Schema.Attribute.Private;
    name: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
    permissions: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.permission'
    >;
    publishedAt: Schema.Attribute.DateTime;
    type: Schema.Attribute.String & Schema.Attribute.Unique;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    users: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    >;
  };
}

export interface PluginUsersPermissionsUser
  extends Struct.CollectionTypeSchema {
  collectionName: 'up_users';
  info: {
    description: '';
    displayName: 'User';
    name: 'user';
    pluralName: 'users';
    singularName: 'user';
  };
  options: {
    draftAndPublish: false;
    timestamps: true;
  };
  attributes: {
    blocked: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    confirmationToken: Schema.Attribute.String & Schema.Attribute.Private;
    confirmed: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    createdAt: Schema.Attribute.DateTime;
    createdBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    email: Schema.Attribute.Email &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    locale: Schema.Attribute.String & Schema.Attribute.Private;
    localizations: Schema.Attribute.Relation<
      'oneToMany',
      'plugin::users-permissions.user'
    > &
      Schema.Attribute.Private;
    password: Schema.Attribute.Password &
      Schema.Attribute.Private &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 6;
      }>;
    provider: Schema.Attribute.String;
    publishedAt: Schema.Attribute.DateTime;
    resetPasswordToken: Schema.Attribute.String & Schema.Attribute.Private;
    role: Schema.Attribute.Relation<
      'manyToOne',
      'plugin::users-permissions.role'
    >;
    updatedAt: Schema.Attribute.DateTime;
    updatedBy: Schema.Attribute.Relation<'oneToOne', 'admin::user'> &
      Schema.Attribute.Private;
    username: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique &
      Schema.Attribute.SetMinMaxLength<{
        minLength: 3;
      }>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ContentTypeSchemas {
      'admin::api-token': AdminApiToken;
      'admin::api-token-permission': AdminApiTokenPermission;
      'admin::permission': AdminPermission;
      'admin::role': AdminRole;
      'admin::session': AdminSession;
      'admin::transfer-token': AdminTransferToken;
      'admin::transfer-token-permission': AdminTransferTokenPermission;
      'admin::user': AdminUser;
      'api::ab-event.ab-event': ApiAbEventAbEvent;
      'api::agent-job.agent-job': ApiAgentJobAgentJob;
      'api::agent-schedule.agent-schedule': ApiAgentScheduleAgentSchedule;
      'api::agent-thread.agent-thread': ApiAgentThreadAgentThread;
      'api::application.application': ApiApplicationApplication;
      'api::article.article': ApiArticleArticle;
      'api::audit-log.audit-log': ApiAuditLogAuditLog;
      'api::award.award': ApiAwardAward;
      'api::banner.banner': ApiBannerBanner;
      'api::block-type.block-type': ApiBlockTypeBlockType;
      'api::blog.blog': ApiBlogBlog;
      'api::breaking-news.breaking-news': ApiBreakingNewsBreakingNews;
      'api::catalog.catalog': ApiCatalogCatalog;
      'api::complaint.complaint': ApiComplaintComplaint;
      'api::consent-log.consent-log': ApiConsentLogConsentLog;
      'api::contact-message.contact-message': ApiContactMessageContactMessage;
      'api::custom-role.custom-role': ApiCustomRoleCustomRole;
      'api::doc-embedding.doc-embedding': ApiDocEmbeddingDocEmbedding;
      'api::download.download': ApiDownloadDownload;
      'api::ebook.ebook': ApiEbookEbook;
      'api::event.event': ApiEventEvent;
      'api::faq.faq': ApiFaqFaq;
      'api::field-policy.field-policy': ApiFieldPolicyFieldPolicy;
      'api::gallery.gallery': ApiGalleryGallery;
      'api::home-page.home-page': ApiHomePageHomePage;
      'api::icon.icon': ApiIconIcon;
      'api::job.job': ApiJobJob;
      'api::landing.landing': ApiLandingLanding;
      'api::location.location': ApiLocationLocation;
      'api::menu-item.menu-item': ApiMenuItemMenuItem;
      'api::mfa-enrollment.mfa-enrollment': ApiMfaEnrollmentMfaEnrollment;
      'api::page-template.page-template': ApiPageTemplatePageTemplate;
      'api::page-version.page-version': ApiPageVersionPageVersion;
      'api::page.page': ApiPagePage;
      'api::poll.poll': ApiPollPoll;
      'api::popup.popup': ApiPopupPopup;
      'api::registration.registration': ApiRegistrationRegistration;
      'api::release.release': ApiReleaseRelease;
      'api::review.review': ApiReviewReview;
      'api::service.service': ApiServiceService;
      'api::sitemap-node.sitemap-node': ApiSitemapNodeSitemapNode;
      'api::sso-credential.sso-credential': ApiSsoCredentialSsoCredential;
      'api::tenant.tenant': ApiTenantTenant;
      'api::top-graphic.top-graphic': ApiTopGraphicTopGraphic;
      'api::video.video': ApiVideoVideo;
      'api::weblink.weblink': ApiWeblinkWeblink;
      'plugin::content-releases.release': PluginContentReleasesRelease;
      'plugin::content-releases.release-action': PluginContentReleasesReleaseAction;
      'plugin::i18n.locale': PluginI18NLocale;
      'plugin::review-workflows.workflow': PluginReviewWorkflowsWorkflow;
      'plugin::review-workflows.workflow-stage': PluginReviewWorkflowsWorkflowStage;
      'plugin::upload.file': PluginUploadFile;
      'plugin::upload.folder': PluginUploadFolder;
      'plugin::users-permissions.permission': PluginUsersPermissionsPermission;
      'plugin::users-permissions.role': PluginUsersPermissionsRole;
      'plugin::users-permissions.user': PluginUsersPermissionsUser;
    }
  }
}
