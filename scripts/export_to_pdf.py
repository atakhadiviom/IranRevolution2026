import json
import os
import requests
import qrcode
from fpdf import FPDF
from PIL import Image

# --- CONFIGURATION ---
BASE_WEBSITE_URL = "https://iranrevolution.online"
JSON_PATH = os.path.join("..", "backups", "memorials_backup_2026-01-16.json")
OUTPUT_DIR = "../printable_posters"
TEMP_IMG_DIR = "../temp_images"

# Layout Settings
MARGIN_TOP = 20
IMAGE_WIDTH = 100  # wider image
MAX_IMAGE_HEIGHT = 100  # cap the height so it doesn't take the whole page

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_IMG_DIR, exist_ok=True)


class PDF(FPDF):
    def header(self):
        # Title
        self.set_font("Helvetica", "B", 26)
        self.cell(0, 15, "IRAN REVOLUTION 2026", align="C", ln=True)
        # Red Line under title
        self.set_line_width(0.5)
        self.set_draw_color(200, 0, 0)
        self.line(20, 28, 190, 28)
        self.ln(10)  # Add space after header

    def footer(self):
        self.set_y(-20)
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(100, 100, 100)
        self.cell(0, 10, "Scan to view verified evidence and sources. | #IranBlackout", align="C", ln=True)


def download_and_process_image(url, filename_base):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, stream=True, timeout=10)
        if response.status_code == 200:
            raw_path = os.path.join(TEMP_IMG_DIR, f"raw_{filename_base}")
            with open(raw_path, 'wb') as f:
                for chunk in response.iter_content(1024):
                    f.write(chunk)

            try:
                with Image.open(raw_path) as img:
                    rgb_im = img.convert('RGB')
                    final_path = os.path.join(TEMP_IMG_DIR, f"{filename_base}.jpg")
                    rgb_im.save(final_path, "JPEG", quality=95)
                if os.path.exists(raw_path): os.remove(raw_path)
                return final_path
            except:
                return None
    except:
        return None
    return None


def generate_pdf(victim):
    pdf = PDF(orientation='P', unit='mm', format='A4')
    pdf.set_auto_page_break(auto=True, margin=25)
    pdf.add_page()

    # --- 1. SMART IMAGE PLACEMENT ---
    photo_url = None
    if victim.get('media') and victim['media'].get('photo'):
        photo_url = victim['media']['photo']

    local_image_path = None
    if photo_url:
        safe_id = "".join([c for c in victim['id'] if c.isalnum()])
        local_image_path = download_and_process_image(photo_url, safe_id)

    # Calculate center position
    page_width = pdf.w  # Usually 210mm
    x_centered = (page_width - IMAGE_WIDTH) / 2

    if local_image_path and os.path.exists(local_image_path):
        # We place the image and let FPDF calculate the height automatically
        # to keep aspect ratio, but we limit the height to MAX_IMAGE_HEIGHT

        # Get dimensions to prevent huge vertical images
        with Image.open(local_image_path) as img:
            w, h = img.size
            aspect = h / w

        render_height = IMAGE_WIDTH * aspect
        if render_height > MAX_IMAGE_HEIGHT:
            render_height = MAX_IMAGE_HEIGHT
            # Recalculate width to keep ratio
            render_width = render_height / aspect
            x_centered = (page_width - render_width) / 2
            pdf.image(local_image_path, x=x_centered, y=pdf.get_y(), h=render_height)
        else:
            pdf.image(local_image_path, x=x_centered, y=pdf.get_y(), w=IMAGE_WIDTH)

        # IMPORTANT: Move cursor down by the height of the image + padding
        pdf.set_y(pdf.get_y() + render_height + 10)
    else:
        # Placeholder Box if no image
        pdf.set_fill_color(230, 230, 230)
        pdf.rect(x_centered, pdf.get_y(), IMAGE_WIDTH, 80, 'F')
        pdf.set_y(pdf.get_y() + 35)  # Move to middle of box
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 10, "IMAGE UNAVAILABLE", align="C", ln=True)
        pdf.set_y(pdf.get_y() + 35 + 10)  # Move past box

    # --- 2. NAME (Bold & Big) ---
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "B", 24)
    name = victim.get('name', 'Unknown Name').encode('latin-1', 'ignore').decode('latin-1')
    pdf.multi_cell(0, 10, name, align="C")
    pdf.ln(2)

    # --- 3. METADATA (City | Date) ---
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(80, 80, 80)
    city = victim.get('city', 'Unknown City')
    date = victim.get('date', 'Unknown Date')
    meta_text = f"{city}  |  {date}"
    pdf.cell(0, 10, meta_text, align="C", ln=True)
    pdf.ln(5)

    # --- 4. BIO (Description) ---
    # Draw a light gray box behind the text for emphasis
    pdf.set_fill_color(245, 245, 245)
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(0, 0, 0)

    bio = victim.get('bio', 'No description available.')
    safe_bio = bio.encode('latin-1', 'ignore').decode('latin-1')

    # Save current Y to draw the rectangle
    start_y = pdf.get_y()
    pdf.multi_cell(0, 7, safe_bio, align="C", fill=False)

    # Add spacing after bio
    pdf.ln(10)

    # --- 5. QR CODE (Bottom Centered) ---
    # We want the QR code to be at the bottom, but if the bio is long,
    # we just place it after the bio.

    # If there is lots of space left, push QR to bottom
    space_left = 297 - pdf.get_y() - 40  # A4 height - current - footer margin
    if space_left > 60:
        pdf.set_y(297 - 80)  # Push to bottom

    full_url = f"{BASE_WEBSITE_URL}/?id={victim['id']}"
    qr = qrcode.make(full_url)
    qr_path = os.path.join(TEMP_IMG_DIR, "qr_temp.png")
    qr.save(qr_path)

    # Centered QR
    qr_size = 45
    x_qr = (page_width - qr_size) / 2
    pdf.image(qr_path, x=x_qr, y=pdf.get_y(), w=qr_size)

    # Save PDF
    output_filename = f"{victim['id']}.pdf"
    pdf.output(os.path.join(OUTPUT_DIR, output_filename))


def main():
    print(f"Reading JSON from {JSON_PATH}...")
    try:
        with open(JSON_PATH, 'r', encoding='utf-8') as f:
            victims = json.load(f)
    except:
        return

    print(f"Generating {len(victims)} posters...")
    for v in victims:
        try:
            generate_pdf(v)
            print(f" [OK] {v['name']}")
        except Exception as e:
            print(f" [!!] Error {v.get('name')}: {e}")


if __name__ == "__main__":
    main()