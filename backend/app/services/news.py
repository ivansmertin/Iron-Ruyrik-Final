from __future__ import annotations

from datetime import UTC, datetime, timedelta
import html
import logging
import re
from typing import ClassVar

import httpx

from ..schemas.domain import NewsPostOut, NewsResponseOut

logger = logging.getLogger(__name__)

CHANNEL_HANDLE = "goverrun"
CHANNEL_URL = "https://t.me/goverrun"
CHANNEL_TITLE = "Говер на движениях"
AUTHOR_NAME = "Дмитрий Говер"
AUTHOR_ROLE = "Основатель и тренер «Железный Рюрик»"
TELEGRAM_WEB_URL = "https://t.me/s/goverrun"

FALLBACK_POSTS = [
    NewsPostOut(
        id="goverrun/671",
        post_number=671,
        url="https://t.me/goverrun/671",
        text="К старту допущен. Стартовый пакет выдан! Готовимся выложиться по максимуму.",
        date=datetime(2026, 9, 4, 9, 51, 45, tzinfo=UTC),
        image_url="https://cdn4.telesco.pe/file/iiuJqyqCJhfwidfsAI4aZ1ijqVIWamhTvrWri10ViJ1gPvqcd-o1fKMIJc9TBC1K8lYEJqNsv2zyzvqthLAvBH56ehdek7IcAtY3Vo4SpSGAAeqBlni7CGImRaIhyFvTp36UljzpKMOipNqbybw9bmA-m_AL8IWqI3Aay134_hH3FBvCXc4V_9n6XeiiCdkteXyiHb9AGGmPRYZ6xZ0zzb2no2W-LiLY7sz0VuFPd7SmxBvX2HQ2UWHK9V7qdMLeMN3iFbbqnecYtNbb_ooLDz3o-Yei_I_eOK2g6tS6sGJ0HzqzNrmh6fmHJ6uzMnu_dSltK8vOD87h9tu5XvAvXQ.jpg",
        views="59",
    ),
    NewsPostOut(
        id="goverrun/670",
        post_number=670,
        url="https://t.me/goverrun/670",
        text="Блин, я почему-то думал что у меня старт 5го вечером будет, а он оказывается уже завтра в 22:00! Ну и ну.",
        date=datetime(2026, 9, 3, 17, 4, 14, tzinfo=UTC),
        image_url="https://cdn4.telesco.pe/file/qyMfaB4aq9KWiKKPi2DzsHAw6H_dC_gPfTu2k4sQcXRCCNUr72lVD4dgrRaGexpVdRnAt39zIHHoUXKuSEKYv-xVcUMiGAVugAuoUtHIu_WcRK9qxgdWOhqFY6pZfdFzClEi4Dwvz8w7iDZTsqHdjaUP5n_FDFB4ADjRnq1VvGA_xcYKeRxZaudohZ3KuCBKbSN5IgbGQO3QZTQ3jfHmT6JoesGZCgSDKx1Y46LTrwi13lxd36BFeZDvSoU3Qf054TboLjaEEXR2vIbewmf96GrG2fUoOWmHBMDMmJy3PLb3Vo0Xum6o1S8tpQnhdPcNeZWtqmXip8LNbJBLFeqkSw.jpg",
        views="66",
    ),
    NewsPostOut(
        id="goverrun/669",
        post_number=669,
        url="https://t.me/goverrun/669",
        text="Стартовый городок прям под окном. Завтра будет жарко!",
        date=datetime(2026, 9, 3, 10, 16, 7, tzinfo=UTC),
        image_url="https://cdn4.telesco.pe/file/ZB3yuuOLZXf1aQpPUXvoYe5uL8uAkF95ofJuzwllHUamE6qOYl0hzJBshS6eayvd42hrBIy6up68a9wvrFN5KExyPZj7k6Lw2HEpG1JkVmcqW2b4XsF-1_8_u6k7OcAcJnOsve0nvHi22mZAfOPy2tbXR33F4B8ME2omE8gAPMmSVaNmUJ3UXADcU_9lzawm25lOf6yP8HLBa5RmAKHg4WzkB6PgqrE2hbtf9wBrNLEVaridnLuGUSQrIUoc6abcb0mw7MBZm4Y0Rv4K32ltzRig1ExI5GgxyLCv10s7hKnpV2krOD95uubzT9QaFOWNv7rmC5k-oM0ME9_fS9ETCg",
        views="68",
    ),
]


class NewsService:
    _cache: ClassVar[list[NewsPostOut] | None] = None
    _cache_time: ClassVar[datetime | None] = None
    _cache_ttl: ClassVar[timedelta] = timedelta(minutes=5)

    @classmethod
    def parse_html(cls, html_content: str) -> list[NewsPostOut]:
        # Split by message wrap blocks
        blocks = re.findall(
            r'<div class="tgme_widget_message_wrap[^"]*"[^>]*>(.*?)</div>\s*</div>\s*(?=<div class="tgme_widget_message_wrap|\s*<div class="tgme_channel_download_telegram|$)',
            html_content,
            re.DOTALL,
        )

        posts: list[NewsPostOut] = []
        for block in blocks:
            post_id_match = re.search(r'data-post="goverrun/(\d+)"', block)
            if not post_id_match:
                continue
            post_num = int(post_id_match.group(1))
            post_id = f"goverrun/{post_num}"

            # Text extraction
            text_match = re.search(r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', block, re.DOTALL)
            text = ""
            if text_match:
                raw_text = text_match.group(1)
                clean = re.sub(r'<br\s*/?>', '\n', raw_text)
                clean = re.sub(r'<[^>]+>', '', clean)
                text = html.unescape(clean).strip()

            # Date extraction
            time_match = re.search(r'<time datetime="([^"]+)"', block)
            post_date: datetime | None = None
            if time_match:
                try:
                    post_date = datetime.fromisoformat(time_match.group(1))
                except Exception:
                    post_date = None

            # Image extraction
            img_match = re.search(r'background-image:url\(\'([^\']+)\'\)', block)
            img_url = img_match.group(1) if img_match else None

            # Views extraction
            views_match = re.search(r'<span class="tgme_widget_message_views">([^<]+)</span>', block)
            views = views_match.group(1) if views_match else None

            if text or img_url:
                posts.append(
                    NewsPostOut(
                        id=post_id,
                        post_number=post_num,
                        url=f"https://t.me/goverrun/{post_num}",
                        text=text,
                        date=post_date,
                        image_url=img_url,
                        views=views,
                    )
                )

        posts.sort(key=lambda x: x.post_number, reverse=True)
        return posts

    @classmethod
    def fetch_posts(cls, limit: int = 10) -> list[NewsPostOut]:
        now = datetime.now(UTC)
        if cls._cache is not None and cls._cache_time is not None:
            if now - cls._cache_time < cls._cache_ttl:
                return cls._cache[:limit]

        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            }
            with httpx.Client(timeout=8.0, follow_redirects=True) as client:
                response = client.get(TELEGRAM_WEB_URL, headers=headers)
                if response.status_code == 200:
                    parsed = cls.parse_html(response.text)
                    if parsed:
                        cls._cache = parsed
                        cls._cache_time = now
                        return parsed[:limit]
        except Exception as err:
            logger.warning("Failed to fetch Telegram news from %s: %s", TELEGRAM_WEB_URL, err)

        # Fallback to cache if exists, otherwise fallback list
        if cls._cache:
            return cls._cache[:limit]
        return FALLBACK_POSTS[:limit]

    @classmethod
    def get_news(cls, limit: int = 6) -> NewsResponseOut:
        posts = cls.fetch_posts(limit=limit)
        return NewsResponseOut(
            channel_title=CHANNEL_TITLE,
            channel_handle=f"@{CHANNEL_HANDLE}",
            channel_url=CHANNEL_URL,
            author_name=AUTHOR_NAME,
            author_role=AUTHOR_ROLE,
            posts=posts,
        )
