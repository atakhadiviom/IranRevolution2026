import QRCode from 'qrcode';
import html2pdf from 'html2pdf.js';
import type { MemorialEntry } from './types';
import { t, currentLanguage } from './i18n';

export async function downloadMemorialPdf(entry: MemorialEntry) {
  const isFa = currentLanguage() === 'fa';
  const displayName = (isFa && entry.name_fa) ? entry.name_fa : entry.name;
  const displayCity = (isFa && entry.city_fa) ? entry.city_fa : entry.city;
  const displayBio = (isFa && entry.bio_fa) ? entry.bio_fa : entry.bio;
  
  const date = new Date(entry.date).toLocaleDateString(isFa ? 'fa-IR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Generate QR Code
  const websiteUrl = `${window.location.origin}${window.location.pathname}?id=${entry.id}`;
  const qrCodeDataUrl = await QRCode.toDataURL(websiteUrl, {
    margin: 1,
    width: 120,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  // Create a temporary container for the PDF content
  const element = document.createElement('div');
  element.style.width = '8.27in'; // A4 width
  element.style.height = '11.69in'; // A4 height
  element.style.display = 'flex';
  element.style.flexDirection = 'column';
  element.style.margin = '0';
  element.style.padding = '0';
  element.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  element.style.backgroundColor = 'white';
  element.style.overflow = 'hidden';

  element.innerHTML = `
    <!-- Top Green Band (Header) -->
    <div style="height: 60px; width: 100%; background-color: #239f40;"></div>

    <!-- Middle White Band (Main Content) -->
    <div style="flex: 1; width: 100%; background-color: #ffffff; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 30px 20px; box-sizing: border-box; text-align: center; overflow: hidden;">
      <!-- Lion Logo Background (Semi-transparent) -->
      <img src="/lion.png" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 70%; opacity: 0.12; z-index: 0;" />
      
      <div style="position: relative; z-index: 1; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; height: 100%; max-height: 100%;">
        ${entry.media?.photo ? `
          <div style="margin-bottom: 25px;">
            <img src="${entry.media.photo}" style="width: 280px; height: 280px; object-fit: cover; border-radius: 50%; border: 8px solid #239f40; box-shadow: 0 10px 25px rgba(0,0,0,0.2);" />
          </div>
        ` : ''}

        <div style="text-align: center; width: 100%; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 48px; color: #111827; font-weight: 800; line-height: 1.1;">${displayName}</h1>
          <p style="margin: 10px 0; font-size: 24px; color: #374151;">
            <strong>${t('details.city')}:</strong> ${displayCity} | <strong>${t('details.date')}:</strong> ${date}
          </p>
        </div>
        
        <div style="width: 92%; line-height: 1.5; font-size: 19px; color: #1a1a1a; direction: ${isFa ? 'rtl' : 'ltr'}; background: rgba(255,255,255,0.7); padding: 25px; border-radius: 15px; margin-bottom: 25px;">
          ${displayBio ? `<p style="margin: 0; white-space: pre-wrap;">${displayBio}</p>` : ''}
        </div>

        <div style="display: flex; align-items: center; justify-content: center; gap: 20px; margin-top: auto; padding-bottom: 20px;">
          <img src="${qrCodeDataUrl}" style="width: 90px; height: 90px;" />
          <div style="text-align: left;">
            <p style="font-size: 16px; color: #111827; font-weight: bold; margin: 0;">${t('site.title')}</p>
            <p style="font-size: 12px; color: #6b7280; margin: 4px 0 0 0;">${t('site.footerNote')}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Red Band (Footer) -->
    <div style="height: 60px; width: 100%; background-color: #da0000;"></div>
  `;

  const opt = {
    margin: 0,
    filename: `${displayName.replace(/\s+/g, '_')}_Protest_Poster.pdf`,
    image: { type: 'jpeg' as const, quality: 1.0 },
    html2canvas: { 
      scale: 3, 
      useCORS: true, 
      logging: false,
      letterRendering: true,
      windowWidth: 800,
      windowHeight: 1131
    },
    jsPDF: { unit: 'in' as const, format: 'a4' as const, orientation: 'portrait' as const },
    pagebreak: { mode: 'avoid-all' }
  };

  // Generate and download the PDF
  try {
    await html2pdf().set(opt).from(element).save();
  } catch (error) {
    console.error('PDF generation failed:', error);
    alert('Failed to generate PDF. Please try again.');
  }
}
