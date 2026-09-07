from __future__ import annotations

from app.services.news import NewsService


def test_news_parser_with_sample_html():
    sample_html = """
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message" data-post="goverrun/100">
        <div class="tgme_widget_message_bubble">
          <div class="tgme_widget_message_photo_wrap" style="background-image:url('https://example.com/test.jpg')"></div>
          <div class="tgme_widget_message_text">Отличная тренировка в субботу!</div>
          <div class="tgme_widget_message_footer">
            <span class="tgme_widget_message_views">120</span>
            <time datetime="2026-09-01T12:00:00+00:00"></time>
          </div>
        </div>
      </div>
    </div>
    """
    posts = NewsService.parse_html(sample_html)
    assert len(posts) == 1
    assert posts[0].id == "goverrun/100"
    assert posts[0].post_number == 100
    assert posts[0].text == "Отличная тренировка в субботу!"
    assert posts[0].views == "120"
    assert posts[0].image_url == "https://example.com/test.jpg"


def test_news_endpoint(client):
    response = client.get("/api/v1/news")
    assert response.status_code == 200
    data = response.json()
    assert data["channelTitle"] == "Говер на движениях"
    assert data["channelHandle"] == "@goverrun"
    assert len(data["posts"]) > 0
    first_post = data["posts"][0]
    assert "id" in first_post
    assert "postNumber" in first_post
    assert "text" in first_post
