import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface PageMetaProps {
  title: string;
  description: string;
}

export function PageMeta({ title, description }: PageMetaProps) {
  const location = useLocation();

  useEffect(() => {
    const fullTitle = title.includes('YTClip') ? title : `${title} | YTClip`;
    document.title = fullTitle;

    const updateMeta = (selector: string, content: string) => {
      const el = document.querySelector<HTMLMetaElement>(selector);
      if (el) el.content = content;
    };

    updateMeta('meta[name="description"]', description);
    updateMeta('meta[property="og:title"]', fullTitle);
    updateMeta('meta[property="og:description"]', description);
    updateMeta('meta[name="twitter:title"]', fullTitle);
    updateMeta('meta[name="twitter:description"]', description);

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const currentUrl = `${window.location.origin}${location.pathname}`;
    if (canonical) {
      canonical.href = currentUrl;
    }
    updateMeta('meta[property="og:url"]', currentUrl);
  }, [title, description, location.pathname]);

  return null;
}
