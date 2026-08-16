# -*- coding: utf-8 -*-

import os
import sys
import subprocess
import time
import re
import io
import logging
import base64
import glob
import tempfile

# ============================================================
# AUTO-INSTALL (همه کتابخانه‌ها)
# ============================================================
def auto_install():
    required = [
        "pillow", "opencv-python", "numpy", "requests",
        "paddlepaddle", "paddleocr", "amazoncaptcha",
        "easyocr", "pytesseract"
    ]
    # keras-ocr اختیاری
    try:
        import keras_ocr
    except ImportError:
        required.append("keras-ocr")
    
    missing = []
    for pkg in required:
        try:
            if pkg in ["paddlepaddle", "paddleocr"]:
                __import__(pkg)
            else:
                __import__(pkg.replace("-", "_"))
        except ImportError:
            missing.append(pkg)
    if missing:
        print("[Installing] " + ', '.join(missing))
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "pip"])
        subprocess.check_call([sys.executable, "-m", "pip", "install"] + missing)
        print("[OK] All dependencies installed.")
    else:
        print("[OK] All packages already installed.")

auto_install()

# ------------------------------------------------------------
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import requests

# PaddleOCR
try:
    from paddleocr import PaddleOCR
    PADDLE_AVAILABLE = True
except:
    PADDLE_AVAILABLE = False

# AmazonCaptcha
try:
    from amazoncaptcha import AmazonCaptcha
    AMAZON_AVAILABLE = True
except:
    AMAZON_AVAILABLE = False

# Tesseract
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except:
    TESSERACT_AVAILABLE = False

# EasyOCR
try:
    import easyocr
    EASYOCR_AVAILABLE = True
except:
    EASYOCR_AVAILABLE = False

# keras-ocr
try:
    import keras_ocr
    KERAS_AVAILABLE = True
except:
    KERAS_AVAILABLE = False

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============================================================
# PERSIAN WORDS -> NUMBER CONVERTER
# ============================================================
BASE_WORDS = {
    'صفر': 0, 'یک': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5,
    'شش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9,
    'ده': 10, 'یازده': 11, 'دوازده': 12, 'سیزده': 13, 'چهارده': 14,
    'پانزده': 15, 'شانزده': 16, 'هفده': 17, 'هجده': 18, 'نوزده': 19,
    'بیست': 20, 'سی': 30, 'چهل': 40, 'پنجاه': 50,
    'شصت': 60, 'هفتاد': 70, 'هشتاد': 80, 'نود': 90,
    'صد': 100, 'دویست': 200, 'سیصد': 300, 'چهارصد': 400,
    'پانصد': 500, 'ششصد': 600, 'هفتصد': 700, 'هشتصد': 800, 'نهصد': 900,
    'هزار': 1000, 'میلیون': 1000000, 'میلیارد': 1000000000
}
ORDINAL_WORDS = {
    'یکم': 1, 'دوم': 2, 'سوم': 3, 'چهارم': 4, 'پنجم': 5,
    'ششم': 6, 'هفتم': 7, 'هشتم': 8, 'نهم': 9, 'دهم': 10,
    'یازدهم': 11, 'دوازدهم': 12, 'سیزدهم': 13, 'چهاردهم': 14,
    'پانزدهم': 15, 'شانزدهم': 16, 'هفدهم': 17, 'هجدهم': 18,
    'نوزدهم': 19, 'بیستم': 20, 'سی‌ام': 30, 'چهلم': 40,
    'پنجاهم': 50, 'شصتم': 60, 'هفتادم': 70, 'هشتادم': 80, 'نودم': 90,
}
WORD_TO_NUM = {**BASE_WORDS, **ORDINAL_WORDS}

SYNONYMS = {
    'پلی': 'چهل', 'سی': 'سی', 'بیست': 'بیست', 'شصت': 'شصت',
    'هزار': 'هزار', 'دو': 'دو', 'سه': 'سه', 'هشتید': 'هشتاد',
    'هشتاد': 'هشتاد', 'چهار': 'چهار', 'سیزده': 'سیزده',
    'سیزدهم': 'سیزدهم', 'سس': 'سی', 'يار': 'یار', 'الصد': 'صد',
    'وشصت': 'شصت', 'ويک': 'یک', 'ذود': 'دو', 'وپنج': 'پنج',
    'يكصد': 'یکصد', 'نود': 'نود', 'جعل': 'چهار',
    'چهارصد': 'چهارصد', 'نه': 'نه', 'نُه': 'نه',
}

def normalize_persian_text(text: str) -> str:
    text = text.replace('ي', 'ی').replace('ك', 'ک')
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def persian_words_to_number(text: str) -> str | None:
    text = normalize_persian_text(text)
    for wrong, correct in SYNONYMS.items():
        text = text.replace(wrong, correct)
    text = re.sub(r'\sو\s', ' ', text)
    tokens = text.split()
    if not tokens:
        return None
    total = 0
    current = 0
    for token in tokens:
        token = token.strip()
        if token in WORD_TO_NUM:
            val = WORD_TO_NUM[token]
            if val >= 1000:
                if current == 0:
                    current = 1
                total += current * val
                current = 0
            elif val >= 100:
                if current == 0:
                    current = val
                else:
                    current *= val
            else:
                current += val
        else:
            if token.isdigit():
                current = int(token)
    total += current
    return str(total) if total > 0 else None

# ============================================================
# TOOLS
# ============================================================
def normalize_digits(s: str) -> str:
    return re.sub(r'[\u06F0-\u06F9]', lambda m: str(ord(m.group(0)) - 0x06F0), s)

def solve_math_expression(text: str) -> str | None:
    s = normalize_digits(text).replace(' ', '')
    if not s:
        return None
    m = re.match(r'(\d{1,3})\s*([+\-*/×÷xX])\s*(\d{1,3})', s)
    if m:
        a = int(m.group(1)); b = int(m.group(3)); op = m.group(2)
        if op == '+': return str(a + b)
        if op == '-': return str(a - b)
        if op in ('*', '×', 'x', 'X'): return str(a * b)
        if op in ('/', '÷'): return str(round(a / b)) if b else None
    only = re.match(r'^\D*(\d{1,6})\D*$', s)
    return only.group(1) if only else None

def is_valid_captcha_number(num: str) -> bool:
    if not num or not num.isdigit():
        return False
    if re.match(r'^(13|14)\d{2}', num):
        return False
    if len(num) < 3 or len(num) > 6:
        return False
    if int(num) < 100:
        return False
    return True

def extract_number_from_text(text: str) -> str | None:
    digits = re.sub(r'[^0-9]', '', text)
    if digits and is_valid_captcha_number(digits):
        return digits
    ans = solve_math_expression(text)
    if ans and is_valid_captcha_number(ans):
        return ans
    ans = persian_words_to_number(text)
    if ans and is_valid_captcha_number(ans):
        return ans
    return None

# ============================================================
# GIF SUPPORT
# ============================================================
def read_image_bytes(img_path):
    ext = os.path.splitext(img_path)[1].lower()
    if ext == '.gif':
        img = Image.open(img_path)
        if img.is_animated:
            img.seek(0)
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()
    else:
        with open(img_path, 'rb') as f:
            return f.read()

# ============================================================
# PREPROCESSING (چندین روش)
# ============================================================
def preprocess_image_advanced(img_bytes, method='adaptive'):
    img = Image.open(io.BytesIO(img_bytes))
    if img.mode != 'RGB':
        img = img.convert('RGB')
    img_np = np.array(img)
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    
    h, w = gray.shape
    if w < 400:
        gray = cv2.resize(gray, (w*2, h*2), interpolation=cv2.INTER_CUBIC)
    
    if method == 'adaptive':
        binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY, 11, 2)
    elif method == 'otsu':
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    elif method == 'simple':
        _, binary = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
    elif method == 'clahe':
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    else:
        binary = gray
    
    if cv2.countNonZero(binary) > binary.size * 0.5:
        binary = cv2.bitwise_not(binary)
    
    kernel = np.ones((2, 2), np.uint8)
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel)
    kernel_dilate = np.ones((1, 2), np.uint8)
    final = cv2.dilate(cleaned, kernel_dilate, iterations=1)
    return final

def preprocess_multiple(img_bytes):
    methods = ['adaptive', 'otsu', 'simple', 'clahe']
    results = []
    for m in methods:
        processed = preprocess_image_advanced(img_bytes, m)
        pil_img = Image.fromarray(processed)
        buf = io.BytesIO()
        pil_img.save(buf, format='PNG')
        results.append(buf.getvalue())
    return results

# ============================================================
# METHOD 1: PaddleOCR (با زبان فارسی)
# ============================================================
_ocr = None
def get_paddle_ocr():
    global _ocr
    if _ocr is None and PADDLE_AVAILABLE:
        try:
            _ocr = PaddleOCR(use_textline_orientation=True, lang='fa', show_log=False)
        except:
            _ocr = None
    return _ocr

def solve_paddleocr(img_bytes):
    ocr = get_paddle_ocr()
    if ocr is None:
        return None
    try:
        processed = preprocess_image_advanced(img_bytes, 'adaptive')
        result = ocr.ocr(processed, cls=True)
        if result and result[0]:
            texts = [line[1][0] for line in result[0]]
            full_text = ' '.join(texts).strip()
            ans = extract_number_from_text(full_text)
            if ans is not None:
                return {'answer': ans, 'raw': full_text, 'method': 'paddleocr-fa'}
            digits = re.sub(r'[^0-9]', '', full_text)
            if len(digits) >= 3 and is_valid_captcha_number(digits):
                return {'answer': digits, 'raw': full_text, 'method': 'paddleocr-fa-fallback'}
    except Exception as e:
        logger.debug(f"PaddleOCR error: {e}")
    return None

# ============================================================
# METHOD 2: AmazonCaptcha
# ============================================================
def solve_amazon(img_bytes):
    if not AMAZON_AVAILABLE:
        return None
    try:
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(img_bytes)
            tmp_path = tmp.name
        captcha = AmazonCaptcha(tmp_path)
        solution = captcha.solve()
        os.unlink(tmp_path)
        if solution and len(solution) >= 3:
            ans = extract_number_from_text(solution)
            if ans is not None:
                return {'answer': ans, 'raw': solution, 'method': 'amazon'}
            digits = re.sub(r'[^0-9]', '', solution)
            if len(digits) >= 3 and is_valid_captcha_number(digits):
                return {'answer': digits, 'raw': solution, 'method': 'amazon-fallback'}
    except Exception as e:
        logger.debug(f"Amazon error: {e}")
    return None

# ============================================================
# METHOD 3: Template Matching (OpenCV)
# ============================================================
def generate_templates():
    fonts = ['Tahoma', 'Arial', 'Segoe UI', 'Times New Roman', 'Courier New']
    digits = ['0','1','2','3','4','5','6','7','8','9']
    templates = []
    size = 32
    for font_name in fonts:
        try:
            font_path = f"C:/Windows/Fonts/{font_name}.ttf"
            if not os.path.exists(font_path):
                font_path = f"/usr/share/fonts/truetype/msttcorefonts/{font_name}.ttf"
            font = ImageFont.truetype(font_path, size=28) if os.path.exists(font_path) else ImageFont.load_default()
        except:
            font = ImageFont.load_default()
        for d in digits:
            img = Image.new('L', (size, size), 255)
            draw = ImageDraw.Draw(img)
            draw.text((size//2, size//2 - 4), d, fill=0, font=font, anchor='mm')
            arr = np.array(img)
            _, arr = cv2.threshold(arr, 200, 255, cv2.THRESH_BINARY_INV)
            arr = cv2.resize(arr, (20, 20))
            templates.append((arr, d))
    return templates

_templates = None
def solve_template(img_bytes):
    global _templates
    if _templates is None:
        _templates = generate_templates()
    try:
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return None
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY_INV, 11, 2)
        kernel = np.ones((2,2), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        bboxes = []
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w*h > 30 and w > 3 and h > 5:
                bboxes.append((x, y, w, h))
        if len(bboxes) < 2:
            return None
        bboxes.sort(key=lambda b: b[0])
        digits = []
        for (x, y, w, h) in bboxes:
            roi = thresh[y:y+h, x:x+w]
            roi = cv2.resize(roi, (20, 20))
            best_score = -1
            best_label = ''
            for ref, label in _templates:
                res = cv2.matchTemplate(roi.astype(np.float32), ref.astype(np.float32),
                                       cv2.TM_CCOEFF_NORMED)
                score = res[0][0]
                if score > best_score:
                    best_score = score
                    best_label = label
            if best_score < 0.35:
                return None
            digits.append(best_label)
        number = ''.join(digits)
        if is_valid_captcha_number(number):
            return {'answer': number, 'raw': number, 'method': 'template'}
    except Exception as e:
        logger.debug(f"Template error: {e}")
    return None

# ============================================================
# METHOD 4: OCR.space
# ============================================================
def solve_ocrspace(img_bytes):
    try:
        b64 = base64.b64encode(img_bytes).decode('utf-8')
        payload = {
            'apikey': 'helloworld',
            'language': 'fas',
            'isOverlayRequired': False,
            'base64Image': f'data:image/png;base64,{b64}'
        }
        response = requests.post('https://api.ocr.space/parse/image',
                                 data=payload, timeout=30)
        if response.status_code == 200:
            data = response.json()
            if data.get('IsErroredOnProcessing') == False:
                parsed_text = data.get('ParsedResults', [{}])[0].get('ParsedText', '').strip()
                if parsed_text:
                    ans = extract_number_from_text(parsed_text)
                    if ans is not None:
                        return {'answer': ans, 'raw': parsed_text, 'method': 'ocrspace'}
    except Exception as e:
        logger.debug(f"OCR.space error: {e}")
    return None

# ============================================================
# METHOD 5: Tesseract (با زبان فارسی + انگلیسی و تنظیمات متعدد)
# ============================================================
def solve_tesseract(img_bytes):
    if not TESSERACT_AVAILABLE:
        return None
    try:
        preprocessed = preprocess_multiple(img_bytes)
        for proc_bytes in preprocessed:
            img = Image.open(io.BytesIO(proc_bytes))
            for lang in ['fas+eng', 'eng']:
                for psm in ['7', '8', '6', '3']:
                    config = f'--psm {psm} -c tessedit_char_whitelist=0123456789'
                    try:
                        text = pytesseract.image_to_string(img, config=config, lang=lang).strip()
                        if text:
                            ans = extract_number_from_text(text)
                            if ans is not None:
                                return {'answer': ans, 'raw': text, 'method': 'tesseract'}
                            digits = re.sub(r'[^0-9]', '', text)
                            if len(digits) >= 3 and is_valid_captcha_number(digits):
                                return {'answer': digits, 'raw': text, 'method': 'tesseract-fallback'}
                    except:
                        continue
    except Exception as e:
        logger.debug(f"Tesseract error: {e}")
    return None

# ============================================================
# METHOD 6: EasyOCR (با دو تنظیم مختلف)
# ============================================================
_reader = None
_reader_digit = None
def get_easyocr_reader(digit_only=False):
    global _reader, _reader_digit
    if digit_only:
        if _reader_digit is None and EASYOCR_AVAILABLE:
            try:
                import easyocr
                _reader_digit = easyocr.Reader(['en', 'fa'], gpu=False, verbose=False)
            except:
                _reader_digit = None
        return _reader_digit
    else:
        if _reader is None and EASYOCR_AVAILABLE:
            try:
                import easyocr
                _reader = easyocr.Reader(['en', 'fa'], gpu=False, verbose=False)
            except:
                _reader = None
        return _reader

def solve_easyocr(img_bytes, digit_only=False):
    reader = get_easyocr_reader(digit_only)
    if reader is None:
        return None
    try:
        preprocessed = preprocess_multiple(img_bytes)
        for proc_bytes in preprocessed:
            img = Image.open(io.BytesIO(proc_bytes))
            img_np = np.array(img)
            if digit_only:
                result = reader.readtext(img_np, detail=0, paragraph=False,
                                        allowlist='0123456789', text_threshold=0.1)
            else:
                result = reader.readtext(img_np, detail=0, paragraph=False,
                                        text_threshold=0.1)
            if result:
                full_text = ' '.join(result).strip()
                ans = extract_number_from_text(full_text)
                if ans is not None:
                    method = 'easyocr-digit' if digit_only else 'easyocr'
                    return {'answer': ans, 'raw': full_text, 'method': method}
                digits = re.sub(r'[^0-9]', '', full_text)
                if len(digits) >= 3 and is_valid_captcha_number(digits):
                    method = 'easyocr-digit-fallback' if digit_only else 'easyocr-fallback'
                    return {'answer': digits, 'raw': full_text, 'method': method}
    except Exception as e:
        logger.debug(f"EasyOCR error: {e}")
    return None

# ============================================================
# METHOD 7: keras-ocr (اگر نصب باشد)
# ============================================================
def solve_keras(img_bytes):
    if not KERAS_AVAILABLE:
        return None
    try:
        # keras-ocr با تصاویر کار می‌کند
        import keras_ocr
        pipeline = keras_ocr.pipeline.Pipeline()
        # تبدیل bytes به تصویر
        img = Image.open(io.BytesIO(img_bytes))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img_np = np.array(img)
        # بزرگنمایی
        h, w, _ = img_np.shape
        if w < 400:
            img_np = cv2.resize(img_np, (w*2, h*2), interpolation=cv2.INTER_CUBIC)
        # تشخیص
        prediction_groups = pipeline.recognize([img_np])
        if prediction_groups and prediction_groups[0]:
            texts = [pred[0] for pred in prediction_groups[0]]
            full_text = ' '.join(texts).strip()
            ans = extract_number_from_text(full_text)
            if ans is not None:
                return {'answer': ans, 'raw': full_text, 'method': 'keras'}
            digits = re.sub(r'[^0-9]', '', full_text)
            if len(digits) >= 3 and is_valid_captcha_number(digits):
                return {'answer': digits, 'raw': full_text, 'method': 'keras-fallback'}
    except Exception as e:
        logger.debug(f"Keras OCR error: {e}")
    return None

# ============================================================
# METHOD 8: تشخیص کاراکترهای جدا شده با OpenCV (بدون OCR)
# ============================================================
def solve_opencv_segmentation(img_bytes):
    try:
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return None
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # باینری با Otsu
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        kernel = np.ones((2,2), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        bboxes = []
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w*h > 30 and w > 3 and h > 5:
                bboxes.append((x, y, w, h))
        if len(bboxes) < 2:
            return None
        bboxes.sort(key=lambda b: b[0])
        # استخراج تقریبی عدد با استفاده از عرض هر بخش (بدون OCR واقعی)
        # اینجا فقط یک روش ساده است که تعداد کاراکترها را تشخیص می‌دهد
        # برای عدد واقعی باید OCR انجام شود، اما این روش به عنوان آخرین راه‌حل
        # می‌تواند عدد را از روی طول کاراکترها حدس بزند (برای کپچاهای ساده)
        # فعلاً این روش را غیرفعال می‌کنیم چون دقت پایینی دارد
        return None
    except Exception as e:
        logger.debug(f"OpenCV segmentation error: {e}")
    return None

# ============================================================
# SOLVE IMAGE (همه روش‌ها)
# ============================================================
def solve_image(img_path):
    logger.info(f"\n{'='*60}")
    logger.info(f"🔍 پردازش: {img_path}")
    img_bytes = read_image_bytes(img_path)
    
    methods = [
        ('PaddleOCR (fa)', solve_paddleocr),
        ('AmazonCaptcha', solve_amazon),
        ('Template Matching', solve_template),
        ('OCR.space', solve_ocrspace),
        ('Tesseract', solve_tesseract),
        ('EasyOCR', lambda b: solve_easyocr(b, False)),
        ('EasyOCR (digit)', lambda b: solve_easyocr(b, True)),
        ('Keras-OCR', solve_keras),
        # روش OpenCV Segmentation (غیرفعال فعلاً)
    ]
    
    results = {}
    for name, func in methods:
        try:
            res = func(img_bytes)
            if res:
                results[name] = res
                logger.info(f"   ✅ {name}: '{res['raw']}' -> {res['answer']} (method: {res['method']})")
            else:
                logger.info(f"   ❌ {name}: ناموفق")
        except Exception as e:
            logger.warning(f"   ⚠️ {name}: خطا - {e}")
    
    order = {'easyocr':0, 'easyocr-digit':1, 'keras':2, 'paddleocr-fa':3, 
             'amazon':4, 'template':5, 'ocrspace':6, 'tesseract':7}
    valid = [(name, res) for name, res in results.items() if is_valid_captcha_number(res['answer'])]
    if valid:
        best = valid[0]
        for name, res in valid[1:]:
            if order.get(res['method'], 99) < order.get(best[1]['method'], 99):
                best = (name, res)
            elif len(res['answer']) > len(best[1]['answer']):
                best = (name, res)
        logger.info(f"   🏆 بهترین: {best[0]} -> {best[1]['answer']} (method: {best[1]['method']})")
        return best[1]['answer']
    else:
        logger.warning("   ❌ هیچ روشی عدد معتبری تشخیص نداد.")
        return None

# ============================================================
# MAIN
# ============================================================
def main():
    logger.info("="*60)
    logger.info("Sir Kanha - 8-Method CAPTCHA Solver (پشتیبانی از .gif)")
    logger.info("="*60)
    
    extensions = ['*.png', '*.jpg', '*.jpeg', '*.bmp', '*.gif']
    image_files = []
    for ext in extensions:
        image_files.extend(glob.glob(ext))
        image_files.extend(glob.glob(ext.upper()))
    
    if not image_files:
        logger.warning("هیچ عکسی در دایرکتوری جاری یافت نشد.")
        return
    
    logger.info(f"تعداد {len(image_files)} عکس پیدا شد.")
    results = {}
    for img_path in image_files:
        ans = solve_image(img_path)
        results[img_path] = ans
    
    print("\n" + "="*60)
    print("📊 نتایج نهایی:")
    for img, ans in results.items():
        status = ans if ans else "❌ تشخیص داده نشد"
        print(f"  {img} -> {status}")
    print("="*60)

if __name__ == "__main__":
    main()