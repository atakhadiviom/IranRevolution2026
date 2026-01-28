export function initInstagram() {
  if (typeof window === 'undefined') return;
  if (document.getElementById('instagram-embed-js')) return;

  const script = document.createElement('script');
  script.id = 'instagram-embed-js';
  script.src = 'https://www.instagram.com/embed.js';
  script.async = true;
  document.body.appendChild(script);
}
