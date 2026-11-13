import { pwaIcon } from "../../pwa-icon";

// Íconos públicos y estáticos del manifest: sin datos del titular ni cookies.
const icons = {
  "icon-192.png": [192, false],
  "icon-512.png": [512, false],
  "icon-maskable-512.png": [512, true],
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const icon = Object.hasOwn(icons, name)
    ? icons[name as keyof typeof icons]
    : null;
  if (!icon) return new Response(null, { status: 404 });
  return pwaIcon(icon[0], icon[1]);
}
