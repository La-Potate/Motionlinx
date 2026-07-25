import { Newspaper } from 'lucide-react';
import contentService from '@/shared/api/content';
import { ContentListPage } from './ContentListPage';

export default function PressReleasePage() {
  return (
    <ContentListPage
      eyebrow="Content"
      icon={Newspaper}
      title="Press Releases"
      description="Generate, edit and route press releases using your shared system prompt."
      createTitle="Create Press Release"
      fields={[
        { id: 'website', label: 'Website URL', placeholder: 'https://example.com', type: 'url' },
        { id: 'author', label: 'Author name', placeholder: 'Jane Doe' },
        { id: 'service', label: 'Service / topic', placeholder: 'e.g. Lemon Law Attorney' },
      ]}
      list={(search) => contentService.listPressReleases(search)}
      generate={(form) => contentService.generatePressRelease(form)}
      update={(id, body) => contentService.updatePressRelease(id, body)}
      remove={(id) => contentService.deletePressRelease(id)}
      titleAccessor={(item) => item.service || 'Untitled press release'}
      secondColumn={{ label: 'Author', accessor: (item) => item.author || '—' }}
    />
  );
}
