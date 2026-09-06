<?php
// บันทึกข้อมูลจราจรทางคอมพิวเตอร์ฝั่ง WordPress — ตาม พ.ร.บ.ว่าด้วยการกระทำ
// ความผิดเกี่ยวกับคอมพิวเตอร์ (TOR ข้อ 4.7.4) เช่นเดียวกับ strapi-cms's
// src/middlewares/traffic-log.ts. เดิม WordPress engine ไม่มี access logging
// ของตัวเองเลย (Strapi ฝั่งเดียวมี) — ORST/RoyalSociety สอง tenant นี้ใช้
// WordPress เป็น backend จริง จึงเป็นช่องโหว่ log-retention ที่สำคัญ (TOR gap
// audit) เก็บ: วันเวลา · IP ต้นทาง · method · path · HTTP status · user-agent
// · ผู้ใช้ที่ล็อกอิน(ถ้ามี) ลงไฟล์รายวัน wp-content/access-logs/access-YYYY-MM-DD.log
// และ purge ไฟล์เก่ากว่า WEBX_ACCESS_LOG_RETENTION_DAYS วัน (ค่าเริ่มต้น 90 —
// ขั้นต่ำตามกฎหมาย) วันละครั้ง ใช้ shutdown action เพื่ออ่าน HTTP status code
// สุดท้ายที่ตอบจริง (รวมถึง request ที่ถูก hardening.php ปิดกั้นด้วย exit()
// เช่น xmlrpc.php — shutdown ยังทำงานอยู่เพราะ mu-plugin นี้ลงทะเบียนไว้ตั้งแต่
// ก่อน init เหมือนกัน จึงเห็นความพยายามที่ถูกบล็อกด้วย ไม่ใช่แค่ที่ผ่านสำเร็จ)

$webx_access_log_dir = WP_CONTENT_DIR . '/access-logs';
if (!file_exists($webx_access_log_dir)) {
    @mkdir($webx_access_log_dir, 0755, true);
}

function webx_access_log_should_skip($uri) {
    return (bool) preg_match('/\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|json)(\?|$)/i', $uri);
}

add_action('shutdown', function () use ($webx_access_log_dir) {
    if (!is_dir($webx_access_log_dir)) return;
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? '-';
    if ($method === 'GET' && webx_access_log_should_skip($uri)) return;

    $now = new DateTime('now', new DateTimeZone('UTC'));
    $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    $ip = $xff ? trim(explode(',', $xff)[0]) : ($_SERVER['REMOTE_ADDR'] ?? '-');
    $user = function_exists('wp_get_current_user') ? wp_get_current_user() : null;
    $status = function_exists('http_response_code') ? http_response_code() : 0;

    $entry = [
        'ts' => $now->format(DateTime::ATOM),
        'ip' => $ip,
        'method' => $method,
        'path' => strtok($uri, '?'),
        'status' => $status ?: 0,
        'ua' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 180),
        'user' => ($user && $user->exists()) ? $user->user_email : null,
    ];

    $file = $webx_access_log_dir . '/access-' . $now->format('Y-m-d') . '.log';
    @file_put_contents($file, json_encode($entry, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
}, 999); // ท้ายสุด ให้ status code ที่อ่านได้เป็นค่าจริงที่ตอบกลับไปแล้ว

// purge ไฟล์เก่ากว่าเกณฑ์ — เดิมไม่มีไฟล์ให้ purge อยู่แล้ว (ไม่เคย log เลย)
// แต่กันไว้ตั้งแต่ต้นสำหรับ deployment ที่รันยาว ไม่ให้ไฟล์สะสมไม่มีเพดาน
add_action('init', function () use ($webx_access_log_dir) {
    // สุ่มทำงานเฉลี่ยวันละครั้ง (แบบเดียวกับ WP-Cron's ธรรมชาติ — ไม่ผูกกับ
    // request ใด request หนึ่งโดยเฉพาะ, ไม่ต้องพึ่ง WP-Cron ที่อาจถูกปิด)
    if (mt_rand(1, 500) !== 1) return;
    if (!is_dir($webx_access_log_dir)) return;
    $retentionDays = (int) (getenv('WEBX_ACCESS_LOG_RETENTION_DAYS') ?: 90);
    $cutoff = time() - ($retentionDays * 86400);
    foreach (scandir($webx_access_log_dir) as $f) {
        if (!preg_match('/^access-(\d{4}-\d{2}-\d{2})\.log$/', $f, $m)) continue;
        $fileTime = strtotime($m[1] . 'T00:00:00+00:00');
        if ($fileTime !== false && $fileTime < $cutoff) {
            @unlink($webx_access_log_dir . '/' . $f);
        }
    }
}, 999);
