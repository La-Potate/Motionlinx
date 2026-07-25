import { PenSquare } from 'lucide-react';
import contentService from '@/shared/api/content';
import { ContentListPage } from './ContentListPage';

export default function BlogPostPage() {
  return (
    <ContentListPage
      eyebrow="Content"
      icon={PenSquare}
      title="Blog Posts"
      description="Long-form blog drafting with site, topic and target word count."
      createTitle="Create blog post"
      fields={[
        { id: 'website', label: 'Website URL', placeholder: 'https://example.com', type: 'url' },
        { id: 'wordCount', label: 'Word count (100–5000)', placeholder: '1000', type: 'number' },
        { id: 'topic', label: 'Topic / keyword', placeholder: 'Local SEO checklist' },
      ]}
      list={(search) => contentService.listBlogPosts(search)}
      generate={(form) =>
        contentService.generateBlogPost({
          ...form,
          wordCount: parseInt(String(form.wordCount), 10) || 1000,
        })
      }
      update={(id, body) => contentService.updateBlogPost(id, body)}
      remove={(id) => contentService.deleteBlogPost(id)}
      titleAccessor={(item) => item.topic || 'Untitled blog post'}
      secondColumn={{ label: 'Topic', accessor: (item) => item.topic || '—' }}
    />
  );
}
