import {
  Badge,
  Body,
  Button,
  Card,
  Divider,
  Heading,
  IconBox,
  IconButton,
  Logo,
  Mono,
  NavLink,
  SearchInput,
  Small,
  Tag,
} from "@/components/ui-kit";
import { EmailInputPreview } from "./_components/EmailInputPreview";

const swatches = [
  { name: "bg", token: "bg-bg", hex: "#0D0F12" },
  { name: "bg-card", token: "bg-bg-card", hex: "#14171C" },
  { name: "bg-elev", token: "bg-bg-elev", hex: "#1A1D24" },
  { name: "border", token: "bg-border", hex: "#2A2F38" },
  { name: "accent", token: "bg-accent", hex: "#FFB380" },
  { name: "accent-2", token: "bg-accent-secondary", hex: "#6B9EFA" },
  { name: "success", token: "bg-success", hex: "#3DD68C" },
  { name: "danger", token: "bg-danger", hex: "#FF5C5C" },
];

function KitSection({
  title,
  tag,
  children,
}: {
  title: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-8 border-t border-border py-16">
      <div className="flex flex-col gap-2">
        {tag && <Tag>{tag}</Tag>}
        <Heading level="h3" as="h2">
          {title}
        </Heading>
      </div>
      {children}
    </section>
  );
}

export default function UiKitPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-10 py-16">
      <header className="flex items-center justify-between pb-12">
        <Logo />
        <nav className="flex items-center gap-8">
          <NavLink href="/">Home</NavLink>
          <NavLink href="/ui-kit" active>
            UI Kit
          </NavLink>
        </nav>
      </header>

      <section className="flex flex-col items-start gap-6 py-10">
        <Tag>{"// METAHUNT.UI-KIT"}</Tag>
        <Heading level="h1" as="h1" className="max-w-[14ch]">
          Neo-brutalist UI Kit.
        </Heading>
        <Body className="max-w-[60ch] text-text-secondary">
          Ізольовані примітиви. Жорсткі краї, суцільні тіні, акцент{" "}
          <span className="text-accent">#FFB380</span>. Композити для лендингу
          живуть у <Mono>app/(landing)/_components/</Mono>.
        </Body>
        <div className="flex gap-4">
          <Button variant="primary">Explore kit</Button>
          <Button variant="secondary">View source</Button>
          <IconButton aria-label="Go" />
        </div>
      </section>

      <KitSection tag="// 01" title="Colors">
        <div className="grid grid-cols-4 gap-4 md:grid-cols-8">
          {swatches.map((s) => (
            <div key={s.name} className="flex flex-col gap-2">
              <div
                className={`h-20 w-full border border-border ${s.token} shadow-[4px_4px_0_0_#000]`}
              />
              <Mono className="text-text-primary">{s.name}</Mono>
              <Small>{s.hex}</Small>
            </div>
          ))}
        </div>
      </KitSection>

      <KitSection tag="// 02" title="Typography">
        <div className="flex flex-col gap-6">
          <Heading level="h1">Heading Large (H1)</Heading>
          <Heading level="h2">Heading Medium (H2)</Heading>
          <Heading level="h3">Heading Small (H3)</Heading>
          <Heading level="section">Section Heading</Heading>
          <Body className="max-w-[65ch]">
            Body Text — used for descriptions and long content blocks.
          </Body>
          <Small>Small text for metadata and labels</Small>
          <Mono>mono_label_example</Mono>
        </div>
      </KitSection>

      <KitSection tag="// 03" title="Buttons">
        <div className="flex flex-wrap items-center gap-6">
          <Button variant="primary">Button Label</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="nav" size="sm">
            Nav Button
          </Button>
          <IconButton />
        </div>
      </KitSection>

      <KitSection tag="// 04" title="Badges">
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant="accent">NEW</Badge>
          <Badge variant="dark">COMING SOON</Badge>
        </div>
      </KitSection>

      <KitSection tag="// 05" title="Inputs">
        <div className="flex flex-col gap-8">
          <SearchInput />
          <EmailInputPreview />
        </div>
      </KitSection>

      <KitSection tag="// 06" title="Card (base)">
        <Card className="w-[320px]">
          <Heading level="h3">Card primitive</Heading>
          <Body className="text-text-secondary">
            Compose page-specific cards on top of this. Section-bound molecules
            (Problem/Step/Feature/etc) live next to their section, not here.
          </Body>
        </Card>
      </KitSection>

      <KitSection tag="// 07" title="Icons">
        <div className="flex flex-wrap gap-6">
          <IconBox label="S" />
          <IconBox label="T" />
          <IconBox label="J" />
          <IconBox label="U" />
        </div>
      </KitSection>

      <KitSection tag="// 08" title="Layout">
        <div className="flex flex-col gap-6">
          <Divider />
          <div className="flex h-24 items-center gap-6">
            <span>Left</span>
            <Divider orientation="vertical" />
            <span>Right</span>
          </div>
        </div>
      </KitSection>

      <footer className="flex items-center justify-between border-t border-border py-10">
        <Mono>© metahunt / ui-kit v0.1</Mono>
        <Mono>neo-brutalism // radius=0 // shadow=solid</Mono>
      </footer>
    </main>
  );
}
