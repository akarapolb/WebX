import { test } from "node:test";
import assert from "node:assert/strict";
import { youtubeId, isVideoLink, videoThumbnail, cardLink } from "./mediaLink";

test("YouTube links in their usual shapes", () => {
  for (const u of ["https://www.youtube.com/watch?v=1LPU6rm4XNw", "https://youtu.be/1LPU6rm4XNw", "https://www.youtube.com/shorts/1LPU6rm4XNw", "https://www.youtube.com/embed/1LPU6rm4XNw", "https://www.youtube.com/watch?t=10&v=1LPU6rm4XNw"]) {
    assert.equal(youtubeId(u), "1LPU6rm4XNw", u);
  }
  assert.equal(videoThumbnail("https://youtu.be/1LPU6rm4XNw"), "https://i.ytimg.com/vi/1LPU6rm4XNw/hqdefault.jpg");
});
test("what counts as a video", () => {
  assert.equal(isVideoLink("https://vimeo.com/123456"), true);
  assert.equal(isVideoLink("/media/clip.mp4"), true);
  assert.equal(isVideoLink("https://www.orst.go.th/news"), false);
  assert.equal(videoThumbnail("https://vimeo.com/123456"), null);
});
test("card links are checked; other sites open in a new tab", () => {
  assert.deepEqual(cardLink("https://youtu.be/1LPU6rm4XNw"), { href: "https://youtu.be/1LPU6rm4XNw", external: true });
  assert.deepEqual(cardLink("/orst/publications"), { href: "/orst/publications", external: false });
  assert.equal(cardLink("javascript:alert(1)"), null);
  assert.equal(cardLink(""), null);
});
