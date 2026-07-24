import { SelectedImageProvider } from "./selected-image-context";

export default function HomePageLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <SelectedImageProvider>{children}</SelectedImageProvider>;
}
