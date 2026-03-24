import './globals.css';

export const metadata = {
  title: 'SEO AI - Replace Your Agency',
  description: 'One-click SEO audits with AI suggestions. Get professional agency-grade reports instantly.',
  viewport: 'width=device-width, initial-scale=1',
  charset: 'utf-8',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={metadata.description} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
