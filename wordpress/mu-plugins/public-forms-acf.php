<?php
// Phase 7 — ACF field groups for the CPTs registered in
// public-forms-post-types.php. Same conventions as acf-fields.php: simple
// field types only (ACF free has no Repeater), JSON-shaped values ride in a
// plain textarea (see acf-fields.php's group_page_layout for the precedent),
// show_in_rest => 1 on every group.
add_action('acf/init', function () {
    if (!function_exists('acf_add_local_field_group')) return;

    acf_add_local_field_group([
        'key' => 'group_poll',
        'title' => 'Poll Details',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_poll_question', 'label' => 'Question', 'name' => 'question', 'type' => 'text'],
            ['key' => 'field_poll_options', 'label' => 'Options (JSON)', 'name' => 'options', 'type' => 'textarea', 'rows' => 6,
                'instructions' => '[{"label":"...","votes":0}, ...] — same shape as the old Strapi poll.options field. Managed by the vote endpoint (webx/v1/polls/:id/vote); hand-edit only to fix a mistake.'],
            ['key' => 'field_poll_active', 'label' => 'Active', 'name' => 'active', 'type' => 'true_false', 'default_value' => 1],
            ['key' => 'field_poll_total_votes', 'label' => 'Total Votes', 'name' => 'total_votes', 'type' => 'number', 'default_value' => 0, 'readonly' => 1],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'poll']]],
    ]);

    acf_add_local_field_group([
        'key' => 'group_complaint',
        'title' => 'Complaint Details',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_complaint_ref', 'label' => 'Reference', 'name' => 'ref', 'type' => 'text', 'readonly' => 1],
            ['key' => 'field_complaint_type', 'label' => 'Type', 'name' => 'type', 'type' => 'text'],
            ['key' => 'field_complaint_subject', 'label' => 'Subject', 'name' => 'subject', 'type' => 'text'],
            ['key' => 'field_complaint_agency', 'label' => 'Agency', 'name' => 'agency', 'type' => 'text'],
            ['key' => 'field_complaint_detail', 'label' => 'Detail', 'name' => 'detail', 'type' => 'textarea', 'rows' => 5],
            ['key' => 'field_complaint_anonymous', 'label' => 'Anonymous', 'name' => 'anonymous', 'type' => 'true_false'],
            ['key' => 'field_complaint_name', 'label' => 'Name (encrypted)', 'name' => 'name', 'type' => 'text', 'readonly' => 1,
                'instructions' => 'PII, encrypted at rest (PDPA) — written/read only through the submit endpoint and webx-studio\'s decrypt-on-read wrapper. Never edit this field directly in wp-admin.'],
            ['key' => 'field_complaint_email', 'label' => 'Email (encrypted)', 'name' => 'email', 'type' => 'text', 'readonly' => 1],
            ['key' => 'field_complaint_phone', 'label' => 'Phone (encrypted)', 'name' => 'phone', 'type' => 'text', 'readonly' => 1],
            ['key' => 'field_complaint_stage', 'label' => 'Stage', 'name' => 'stage', 'type' => 'number', 'default_value' => 0,
                'instructions' => '0 = new, 1 = in progress, 2 = resolved, 3 = closed — same convention as before.'],
            ['key' => 'field_complaint_date', 'label' => 'Date', 'name' => 'date', 'type' => 'text', 'readonly' => 1],
            ['key' => 'field_complaint_steps', 'label' => 'Steps (JSON)', 'name' => 'steps', 'type' => 'textarea', 'rows' => 4],
            ['key' => 'field_complaint_attachment', 'label' => 'Attachment', 'name' => 'attachment', 'type' => 'file', 'return_format' => 'id'],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'complaint']]],
    ]);

    acf_add_local_field_group([
        'key' => 'group_contact_message',
        'title' => 'Contact Message Details',
        'show_in_rest' => 1,
        'fields' => [
            // "name" uses native post_title, same convention as poll's "question".
            ['key' => 'field_cm_email', 'label' => 'Email (encrypted)', 'name' => 'email', 'type' => 'text', 'readonly' => 1],
            ['key' => 'field_cm_phone', 'label' => 'Phone (encrypted)', 'name' => 'phone', 'type' => 'text', 'readonly' => 1],
            ['key' => 'field_cm_subject', 'label' => 'Subject', 'name' => 'subject', 'type' => 'text'],
            ['key' => 'field_cm_message', 'label' => 'Message', 'name' => 'message', 'type' => 'textarea', 'rows' => 5],
            ['key' => 'field_cm_handled', 'label' => 'Handled', 'name' => 'handled', 'type' => 'true_false'],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'contact_message']]],
    ]);

    acf_add_local_field_group([
        'key' => 'group_job',
        'title' => 'Job Details',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_job_job_id', 'label' => 'Job ID', 'name' => 'jobId', 'type' => 'text'],
            ['key' => 'field_job_dept_key', 'label' => 'Department Key', 'name' => 'deptKey', 'type' => 'text',
                'instructions' => 'e.g. tech / data / design / security / pm / corporate'],
            ['key' => 'field_job_type_key', 'label' => 'Type Key', 'name' => 'typeKey', 'type' => 'text',
                'instructions' => 'e.g. fulltime / contract / internship'],
            ['key' => 'field_job_openings', 'label' => 'Openings', 'name' => 'openings', 'type' => 'number', 'default_value' => 1],
            ['key' => 'field_job_dept', 'label' => 'Department', 'name' => 'dept', 'type' => 'text'],
            ['key' => 'field_job_type', 'label' => 'Type', 'name' => 'type', 'type' => 'text'],
            ['key' => 'field_job_location', 'label' => 'Location', 'name' => 'location', 'type' => 'text'],
            ['key' => 'field_job_salary', 'label' => 'Salary', 'name' => 'salary', 'type' => 'text'],
            ['key' => 'field_job_deadline', 'label' => 'Deadline', 'name' => 'deadline', 'type' => 'text'],
            ['key' => 'field_job_summary', 'label' => 'Summary', 'name' => 'summary', 'type' => 'textarea', 'rows' => 3],
            ['key' => 'field_job_responsibilities', 'label' => 'Responsibilities (JSON)', 'name' => 'responsibilities', 'type' => 'textarea', 'rows' => 4,
                'instructions' => '["...", "..."] — a JSON array of strings.'],
            ['key' => 'field_job_qualifications', 'label' => 'Qualifications (JSON)', 'name' => 'qualifications', 'type' => 'textarea', 'rows' => 4],
            ['key' => 'field_job_benefits', 'label' => 'Benefits (JSON)', 'name' => 'benefits', 'type' => 'textarea', 'rows' => 4],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'job']]],
    ]);

    acf_add_local_field_group([
        'key' => 'group_application',
        'title' => 'Application Details',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_app_ref', 'label' => 'Reference', 'name' => 'ref', 'type' => 'text', 'readonly' => 1],
            ['key' => 'field_app_job_id', 'label' => 'Job ID', 'name' => 'jobId', 'type' => 'text'],
            ['key' => 'field_app_position', 'label' => 'Position', 'name' => 'position', 'type' => 'text'],
            ['key' => 'field_app_name', 'label' => 'Name (encrypted)', 'name' => 'name', 'type' => 'text', 'readonly' => 1],
            ['key' => 'field_app_email', 'label' => 'Email (encrypted)', 'name' => 'email', 'type' => 'text', 'readonly' => 1],
            ['key' => 'field_app_phone', 'label' => 'Phone (encrypted)', 'name' => 'phone', 'type' => 'text', 'readonly' => 1],
            ['key' => 'field_app_note', 'label' => 'Note', 'name' => 'note', 'type' => 'textarea', 'rows' => 3],
            ['key' => 'field_app_stage', 'label' => 'Stage', 'name' => 'stage', 'type' => 'number', 'default_value' => 0],
            ['key' => 'field_app_date', 'label' => 'Date', 'name' => 'date', 'type' => 'text', 'readonly' => 1],
            ['key' => 'field_app_resume', 'label' => 'Resume', 'name' => 'resume', 'type' => 'file', 'return_format' => 'id'],
            ['key' => 'field_app_extra', 'label' => 'Extra (JSON)', 'name' => 'extra', 'type' => 'textarea', 'rows' => 3],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'application']]],
    ]);

    acf_add_local_field_group([
        'key' => 'group_breaking_news',
        'title' => 'Breaking News Details',
        'show_in_rest' => 1,
        'fields' => [
            ['key' => 'field_bn_active', 'label' => 'Active', 'name' => 'active', 'type' => 'true_false', 'default_value' => 0,
                'instructions' => 'Whether the banner is currently shown on the public site.'],
            ['key' => 'field_bn_severity', 'label' => 'Severity', 'name' => 'severity', 'type' => 'select',
                'choices' => ['info' => 'Info', 'warning' => 'Warning', 'critical' => 'Critical'], 'default_value' => 'warning'],
            ['key' => 'field_bn_message', 'label' => 'Message', 'name' => 'message', 'type' => 'textarea', 'rows' => 2],
            ['key' => 'field_bn_url', 'label' => 'URL', 'name' => 'url', 'type' => 'url',
                'instructions' => 'Optional "read more" link — left blank shows text only.'],
            ['key' => 'field_bn_link_label', 'label' => 'Link Label', 'name' => 'link_label', 'type' => 'text', 'default_value' => 'อ่านเพิ่มเติม'],
        ],
        'location' => [[['param' => 'post_type', 'operator' => '==', 'value' => 'breaking_news']]],
    ]);
}, 10);
