import { PageHeader } from './PageHeader';
import { ToolCard, type ToolCardProps } from './ToolCard';

type Props = {
  eyebrow: string;
  title: string;
  description?: string;
  tools: ToolCardProps[];
};

export function HubLanding({ eyebrow, title, description, tools }: Props) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        hideBack
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <ToolCard key={tool.title} {...tool} />
        ))}
      </div>
    </div>
  );
}
