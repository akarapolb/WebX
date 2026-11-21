// WebX site kit — the 404 page. A static export writes /<tenant>/404.html; a
// host serving one tenant uses it as its error page. The page is bilingual
// because the host can't tell which language the missing URL was in.
import type { Metadata } from "next";

export const notFoundMetadata: Metadata = { title: "ไม่พบหน้านี้ · Page not found", robots: { index: false } };

export const NOT_FOUND_TEXT = {
  th: { title: "ไม่พบหน้านี้", body: "หน้าที่คุณเรียกอาจถูกย้ายหรือไม่มีอยู่แล้ว ลองค้นหา หรือกลับไปที่หน้าแรก", home: "หน้าแรก", search: "ค้นหา" },
  en: { title: "Page not found", body: "The page may have moved or no longer exists. Try searching, or go back to the home page.", home: "English home", search: "Search" },
};
