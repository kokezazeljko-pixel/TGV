// Name and icon a phone or browser uses when someone saves or installs the site (Add to Home screen, Install app)
export default function manifest() {
  return {
    name: "Train Punctuality",
    short_name: "Train Punctuality",
    description: "Live train delays in Europe and reports from passengers on board.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef1f5",
    theme_color: "#16233f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
