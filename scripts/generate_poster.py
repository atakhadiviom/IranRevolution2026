import argparse
import json
import os
import requests
import qrcode
from fpdf import FPDF
from PIL import Image

# For Persian Text Support
import arabic_reshaper
from bidi.algorithm import get_display

# --- CONFIGURATION ---
BASE_WEBSITE_URL = "https://iranrevolution.online"
# Note: JSON_PATH is set dynamically in main(), this is just a fallback default
DEFAULT_JSON_PATH = os.path.join("..", "backups", "memorials_backup_2026-01-20_13-38-20.json")
DEFAULT_OUTPUT_DIR = "../printable_posters"
TEMP_IMG_DIR = "../temp_images"
FONT_PATH = "Vazir.ttf"  # Make sure this file exists in the same folder!

# Layout Settings
MARGIN_TOP = 20
IMAGE_WIDTH = 150
MAX_IMAGE_HEIGHT = 140

# Create directories immediately
os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_IMG_DIR, exist_ok=True)

# Global variables to be updated by main
JSON_PATH = DEFAULT_JSON_PATH
OUTPUT_DIR = DEFAULT_OUTPUT_DIR


def process_persian_text(text):
    if not text:
        return ""
    # 1. Reshape characters (connects letters properly)
    reshaped_text = arabic_reshaper.reshape(text)
    # 2. Reorder for Right-to-Left display
    bidi_text = get_display(reshaped_text)
    return bidi_text


class PDF(FPDF):
    def header(self):
        # Title
        self.set_font("Helvetica", "B", 26)
        self.cell(0, 15, "IRAN REVOLUTION 2026", align="C", ln=True)
        # Red Line under title
        self.set_line_width(0.5)
        self.set_draw_color(200, 0, 0)
        self.line(20, 28, 190, 28)
        self.ln(10)

    def footer(self):
        self.set_y(-20)
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(100, 100, 100)
        # Right aligned footer text
        self.cell(0, 10, "Scan to view verified evidence and sources. | #IranBlackout", align="R", ln=True)


def download_and_process_image(url, filename_base):
    headers = {
        "User-Agent": "Mozilla/5.0"
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

    # Register Persian Font
    try:
        # uni=True is required for the old FPDF library, ignored/compatible with newer fpdf2
        pdf.add_font('Vazir', '', FONT_PATH, uni=True)
    except Exception as e:
        print(f"Warning: Could not load font {FONT_PATH}. ({e})")

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
    page_width = pdf.w
    x_centered = (page_width - IMAGE_WIDTH) / 2

    if local_image_path and os.path.exists(local_image_path):
        with Image.open(local_image_path) as img:
            w, h = img.size
            aspect = h / w

        render_height = IMAGE_WIDTH * aspect
        if render_height > MAX_IMAGE_HEIGHT:
            render_height = MAX_IMAGE_HEIGHT
            render_width = render_height / aspect
            x_centered = (page_width - render_width) / 2
            pdf.image(local_image_path, x=x_centered, y=pdf.get_y(), h=render_height)
        else:
            pdf.image(local_image_path, x=x_centered, y=pdf.get_y(), w=IMAGE_WIDTH)

        pdf.set_y(pdf.get_y() + render_height + 10)
    else:
        # Placeholder Box
        pdf.set_fill_color(230, 230, 230)
        pdf.rect(x_centered, pdf.get_y(), IMAGE_WIDTH, 80, 'F')
        pdf.set_y(pdf.get_y() + 35)
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 10, "IMAGE UNAVAILABLE", align="C", ln=True)
        pdf.set_y(pdf.get_y() + 35 + 10)

    # --- 2. NAMES (English & Persian) ---
    pdf.set_text_color(0, 0, 0)

    # A. English Name
    english_name = victim.get('name', 'Unknown Name')
    try:
        pdf.set_font("Helvetica", "B", 24)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(w=pdf.epw, h=10, text=english_name, align="C")
    except:
        pdf.set_font("Vazir", "", 24)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(w=pdf.epw, h=10, text=english_name, align="C")

    # B. Persian Name (Vazir)
    persian_name = victim.get('name_fa')
    if persian_name:
        try:
            pdf.set_font("Vazir", "", 20)
            display_name_fa = process_persian_text(persian_name)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(w=pdf.epw, h=10, text=display_name_fa, align="C")
        except Exception as e:
            print(f"Skipping Persian name due to error: {e}")

    pdf.ln(2)

    # --- 3. METADATA (City | Date) ---
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(80, 80, 80)

    city = victim.get('city', 'Unknown City')
    date = victim.get('date', 'Unknown Date')
    meta_text = f"{city}  |  {date}"

    pdf.cell(0, 10, meta_text, align="C", ln=True)
    pdf.ln(5)

    # --- 4. PREPARE QR POSITION ---
    # We define the QR position FIRST so the Bio knows where to stop.
    # Page Height (297) - Bottom Margin (approx 15) - QR Size (45) ~= 237
    # We pick 240 to push it as low as safely possible near the footer.
    qr_fixed_y = 240
    qr_size = 45
    qr_x = 20  # Left aligned

    # --- 5. BIO (Description) with Dynamic Font Sizing ---
    pdf.set_fill_color(245, 245, 245)
    pdf.set_text_color(0, 0, 0)

    bio = victim.get('bio', 'No description available.')
    safe_bio = bio.replace('\u200c', '')
    display_bio = process_persian_text(safe_bio)

    # Calculate Available Space
    current_y = pdf.get_y()
    # Leave 5mm buffer before hitting the top of the QR code area
    available_height = qr_fixed_y - current_y - 5

    if available_height < 10:
        print(f" [!] Skipping bio for {victim.get('name')}: Not enough space.")
    else:
        # Iteratively find the best font size
        chosen_font_size = 8  # Default fallback
        chosen_line_height = 5
        font_sizes_to_try = [16, 14, 13, 12, 11, 10, 9, 8]

        for size in font_sizes_to_try:
            try:
                pdf.set_font("Vazir", "", size)
            except:
                pdf.set_font("Helvetica", "", size)

            line_height = size * 0.6

            # dry_run=True to calculate height
            text_height = pdf.multi_cell(w=pdf.epw, h=line_height, text=display_bio, align="C", dry_run=True,
                                         output="HEIGHT")

            if text_height <= available_height:
                chosen_font_size = size
                chosen_line_height = line_height
                break

        # Print with the chosen size
        try:
            pdf.set_font("Vazir", "", chosen_font_size)
        except:
            pdf.set_font("Helvetica", "", chosen_font_size)

        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(w=pdf.epw, h=chosen_line_height, text=display_bio, align="C", fill=False)

    # --- 6. GENERATE AND PLACE QR CODE ---
    full_url = f"{BASE_WEBSITE_URL}/?id={victim['id']}"
    qr = qrcode.make(full_url)
    qr_path = os.path.join(TEMP_IMG_DIR, "qr_temp.png")
    qr.save(qr_path)

    # Place image at the fixed bottom-left position
    pdf.image(qr_path, x=qr_x, y=qr_fixed_y, w=qr_size)

    # Save PDF
    output_filename = f"{victim['id']}.pdf"
    pdf.output(os.path.join(OUTPUT_DIR, output_filename))


def main():
    parser = argparse.ArgumentParser(description="Generate memorial posters from a JSON file.")
    parser.add_argument(
        "input_file",
        nargs="?",
        default=DEFAULT_JSON_PATH,
        help="Path to the input JSON file containing memorial data."
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT_DIR,
        help="Directory to save the generated PDF files."
    )

    args = parser.parse_args()

    global JSON_PATH, OUTPUT_DIR
    JSON_PATH = args.input_file
    OUTPUT_DIR = args.output

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Reading JSON from: {JSON_PATH}")
    print(f"Saving PDFs to:    {OUTPUT_DIR}")

    if not os.path.exists(JSON_PATH):
        print(f"[ERROR] The file '{JSON_PATH}' does not exist.")
        return

    try:
        with open(JSON_PATH, 'r', encoding='utf-8') as f:
            victims = json.load(f)
    except Exception as e:
        print(f"Error reading JSON: {e}")
        return

    print(f"Generating {len(victims)} posters...")
    for v in victims:
        try:
            generate_pdf(v)
            print(f" [OK] {v.get('name', 'Unknown')}")
        except Exception as e:
            print(f" [!!] Error {v.get('name')}: {e}")


if __name__ == "__main__":
    main()