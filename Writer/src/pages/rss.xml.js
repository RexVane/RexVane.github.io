import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = (await getCollection('blog', ({ id }) => id.startsWith('zh/')))
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: "RexVane's Blog",
    description: 'RexVane 的个人博客：技术、项目与生活记录',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/blog/${post.id.replace('zh/', '')}/`,
    })),
    customData: '<language>zh-cn</language>',
  });
}
