import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- Configuration ---

// The Master Template provided in the prompt. 
// The React App acts as the "Patcher" to fill in the placeholders.
const MASTER_TEMPLATE = `"""
QC BACKEND V5 - MASTER TEMPLATE
This is the universal template. DO NOT edit directly.
Use patcher.py to generate book-specific backends.
"""

print("🔧 Auth...")
from google.colab import auth
auth.authenticate_user()

print("📦 Install...")
!pip3 install --upgrade --quiet google-genai pillow flask flask-cors pyngrok

from flask import Flask, request, jsonify
from flask_cors import CORS
from pathlib import Path
from google import genai
from google.genai import types
from PIL import Image
import base64
from io import BytesIO
import time
from pyngrok import ngrok
import threading
import os
import re
import json

app = Flask(__name__)
CORS(app)

# ============================================================================
# CONFIG
# ============================================================================

PROJECT_ID = "alternity-470908"
LOCATION = "global"
MODEL_ID = "gemini-3-pro-image-preview"
NGROK_TOKEN = "2lYIJEGho1ExHGjJGPOnyN8N2Cz_3hv74cinmWnjjYrmQ5PB2"

# <<<PATCH:BOOK_INFO>>>
BOOK_ID = "unknown"
BOOK_NAME = "Unknown Book"
GENERATION_DATE = "unknown"
# <<<END_PATCH:BOOK_INFO>>>

print(f"\\n{'='*70}")
print(f"🔥 QC BACKEND V5 - {BOOK_NAME}")
print(f"   Book ID: {BOOK_ID}")
print(f"   Model: {MODEL_ID}")
print(f"{'='*70}\\n")

client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)

# Directories
HEADSHOTS_DIR = "/content/references/headshots"
OUTFITS_DIR = "/content/references/outfits"
SETTINGS_DIR = "/content/references/settings"
OUTPUT_DIR = "/content/scene_output"
ORIGINAL_SCENES_DIR = "/content/scene_output"
CUSTOM_REFS_DIR = "/content/custom_references"
BACKGROUNDS_DIR = "/content/backgrounds_output"
SOUNDS_DIR = "/content/sounds_output"

# Create directories
for dir_path in [CUSTOM_REFS_DIR, BACKGROUNDS_DIR, SOUNDS_DIR, OUTPUT_DIR]:
    Path(dir_path).mkdir(exist_ok=True, parents=True)

# ============================================================================
# CHARACTER PROFILES (BOOK-SPECIFIC)
# ============================================================================

# <<<PATCH:CHARACTER_PROFILES>>>
CHARACTER_PROFILES = {}
# <<<END_PATCH:CHARACTER_PROFILES>>>

# ============================================================================
# SETTING KEYWORD MAP (BOOK-SPECIFIC)
# ============================================================================

# <<<PATCH:SETTING_KEYWORD_MAP>>>
SETTING_KEYWORD_MAP = {}
# <<<END_PATCH:SETTING_KEYWORD_MAP>>>

# ============================================================================
# CUSTOM SETTING LAYOUTS (BOOK-SPECIFIC)
# ============================================================================

# <<<PATCH:CUSTOM_LAYOUTS>>>
CUSTOM_LAYOUTS = {}
# <<<END_PATCH:CUSTOM_LAYOUTS>>>

# ============================================================================
# STANDARD SETTING LAYOUTS (UNIVERSAL LIBRARY)
# ============================================================================

STANDARD_LAYOUTS = {
    "hospital_vip": """VIP hospital room - LOCKED LAYOUT:
- Medical bed: CENTER-LEFT (fixed)
- Large window: RIGHT wall (fixed)
- Medical equipment: LEFT side (fixed)
- IV stand: LEFT next to bed (fixed)
- Bedside table: RIGHT of bed (fixed)
- White walls, warm lighting""",

    "hospital_regular": """Hospital room - LOCKED LAYOUT:
- Medical bed: CENTER (fixed)
- White walls
- Medical equipment on wall
- Sterile medical atmosphere""",

    "hospital_corridor": """Hospital corridor - LOCKED LAYOUT:
- Long hallway with doors on sides
- Medical signage on walls
- Professional hospital lighting""",

    "apartment_living_room": """Apartment living room - LOCKED LAYOUT:
- Sofa: CENTER-FRONT (fixed)
- TV: BACK wall (fixed)
- Coffee table: FRONT of sofa (fixed)
- Warm ambient lighting""",

    "apartment_bedroom": """Apartment bedroom - LOCKED LAYOUT:
- Queen bed: CENTER (fixed)
- Bedside tables: SIDES of bed (fixed)
- Soft curtains, warm lighting""",

    "apartment_kitchen": """Apartment kitchen - LOCKED LAYOUT:
- White cabinets on walls (fixed)
- Dining table (fixed)
- Clean contemporary design""",

    "office_workspace": """Office workspace - LOCKED LAYOUT:
- Desk: CENTER (fixed)
- Chair, computer setup
- Professional office lighting""",

    "cafe_interior": """Cafe interior - LOCKED LAYOUT:
- Tables and chairs arranged
- Counter in background
- Warm cozy lighting""",

    "park_outdoor": """Park outdoor - LOCKED LAYOUT:
- Trees and greenery
- Pathway or bench
- Natural daylight""",

    "mall_interior": """Mall interior - LOCKED LAYOUT:
- Retail stores in background
- Open commercial space
- Bright commercial lighting""",

    "car_interior": """Car interior - LOCKED LAYOUT:
- Car seats (fixed)
- Dashboard visible
- Enclosed automobile space""",

    "street_exterior": """Street exterior - LOCKED LAYOUT:
- Urban/suburban street
- Buildings/shops in background
- Natural daylight""",

    "restaurant": """Restaurant - LOCKED LAYOUT:
- Dining tables and chairs
- Restaurant ambiance
- Warm dining lighting""",

    "generic": """Indoor interior - LOCKED LAYOUT:
- Main furniture in fixed positions
- Walls and windows in same locations
- Appropriate lighting"""
}

# Merge: Custom layouts override standards
SETTING_LAYOUTS = {**STANDARD_LAYOUTS, **CUSTOM_LAYOUTS}

print(f"📚 Loaded {len(CHARACTER_PROFILES)} characters")
print(f"🏠 Loaded {len(SETTING_LAYOUTS)} settings ({len(CUSTOM_LAYOUTS)} custom)")

# ============================================================================
# SMART SETTING DETECTION
# ============================================================================

def detect_setting_smart(prompt_text, original_filename=""):
    """Smart setting detection from prompt AND filename"""
    prompt_lower = prompt_text.lower()
    filename_lower = original_filename.lower()

    # Priority 1: Check SETTING_KEYWORD_MAP from book config
    if SETTING_KEYWORD_MAP:
        for raw_text, standard_key in SETTING_KEYWORD_MAP.items():
            if raw_text.lower() in prompt_lower:
                return standard_key
            if raw_text.lower() in filename_lower:
                return standard_key

    # Priority 2: Check standard keywords
    SETTING_KEYWORDS = {
        "hospital_vip": ["vip", "ruang rawat inap vip", "kamar vip"],
        "hospital_corridor": ["koridor hospital", "hospital corridor", "lorong hospital"],
        "hospital_regular": ["hospital", "rumah sakit", "ruang rawat", "medical room"],
        "apartment_living_room": ["living room", "ruang tamu", "sofa", "tv room"],
        "apartment_bedroom": ["bedroom", "kamar tidur", "tempat tidur"],
        "apartment_kitchen": ["kitchen", "dapur", "dining"],
        "office_workspace": ["office", "kantor", "workspace", "ruang kerja"],
        "cafe_interior": ["cafe", "kafe", "coffee shop"],
        "restaurant": ["restaurant", "restoran"],
        "park_outdoor": ["park", "taman", "outdoor", "luar ruangan"],
        "mall_interior": ["mall", "shopping", "toko"],
        "car_interior": ["car", "mobil", "dalam mobil", "in car"],
        "street_exterior": ["street", "jalan", "road", "outdoor street"],
    }

    priority = [
        "hospital_vip", "hospital_corridor", "hospital_regular",
        "apartment_living_room", "apartment_bedroom", "apartment_kitchen",
        "office_workspace", "cafe_interior", "restaurant",
        "park_outdoor", "mall_interior", "car_interior", "street_exterior"
    ]

    for setting in priority:
        for keyword in SETTING_KEYWORDS.get(setting, []):
            if keyword in prompt_lower or keyword in filename_lower:
                return setting

    return "generic"

# ============================================================================
# CHARACTER DETECTION FROM PROMPT
# ============================================================================

def detect_characters_from_prompt(prompt_text):
    """Detect characters mentioned in prompt"""
    detected = {}
    prompt_lower = prompt_text.lower()
    
    for char_name in CHARACTER_PROFILES.keys():
        if char_name.lower() in prompt_lower:
            outfit_type = "default"
            
            # Dynamic check based on available keys in profile
            profile_outfits = CHARACTER_PROFILES[char_name].get("outfits", {})
            
            # Check for keys existing in the profile first (Priority)
            for key in profile_outfits.keys():
                if key == "default": continue
                
                # Simple heuristic mapping for detection
                search_terms = [key]
                if key == "casual": search_terms.extend(["santai", "relaxed"])
                if key == "patient": search_terms.extend(["pasien", "sakit", "hospital gown"])
                if key == "sleepwear": search_terms.extend(["tidur", "piyama", "pajamas"])
                if key == "formal": search_terms.extend(["resmi", "pesta", "jas"])
                if key == "relaxed": search_terms.extend(["santai", "relax"])
                
                if any(term in prompt_lower for term in search_terms):
                    outfit_type = key
                    break
            
            detected[char_name] = outfit_type
    
    return detected

# ============================================================================
# NATURAL LANGUAGE COMMAND PARSER
# ============================================================================

def parse_natural_commands(revision_prompt):
    """Parse natural language revision commands"""
    commands = {
        "position_swap": None,
        "weather": None,
        "lighting": None,
        "custom_action": None,
        "color_tone": None
    }

    prompt_lower = revision_prompt.lower()

    if any(word in prompt_lower for word in ["pindahkan", "swap", "tukar posisi", "ganti posisi"]):
        chars_in_prompt = []
        for char in CHARACTER_PROFILES.keys():
            if char.lower() in prompt_lower:
                chars_in_prompt.append(char)
        if len(chars_in_prompt) >= 2:
            commands["position_swap"] = chars_in_prompt[:2]

    weather_keywords = {
        "sunny": ["sunny", "cerah", "terang"],
        "rainy": ["rain", "hujan", "rainy"],
        "cloudy": ["cloudy", "berawan", "mendung"],
        "night": ["night", "malam", "dark"],
        "dawn": ["dawn", "fajar", "pagi"],
        "dusk": ["dusk", "senja", "sore"]
    }

    for weather_type, keywords in weather_keywords.items():
        if any(kw in prompt_lower for kw in keywords):
            commands["weather"] = weather_type
            break

    if any(word in prompt_lower for word in ["terang", "bright", "brighter", "lighter"]):
        commands["lighting"] = "brighter"
    elif any(word in prompt_lower for word in ["gelap", "dark", "darker", "dim"]):
        commands["lighting"] = "darker"
    elif any(word in prompt_lower for word in ["warm", "hangat", "cozy"]):
        commands["lighting"] = "warmer"
    elif any(word in prompt_lower for word in ["cool", "dingin", "cold"]):
        commands["lighting"] = "cooler"

    if any(word in prompt_lower for word in ["saturated", "vibrant", "vivid", "jenuh"]):
        commands["color_tone"] = "more saturated"
    elif any(word in prompt_lower for word in ["desaturated", "muted", "soft", "lembut"]):
        commands["color_tone"] = "desaturated"
    elif any(word in prompt_lower for word in ["contrast", "kontras"]):
        commands["color_tone"] = "higher contrast"

    if not any(commands.values()):
        commands["custom_action"] = revision_prompt

    return commands

# ============================================================================
# ENHANCED PROMPT BUILDER
# ============================================================================

def build_ultimate_prompt(
    user_prompt,
    detected_chars,
    setting_type,
    revision_commands=None,
    custom_outfits=None,
    original_scene_ref=None,
    match_color_tone=True
):
    """Build ultimate prompt with all features"""

    char_descriptions = []
    for char_name, outfit_type in detected_chars.items():
        if char_name not in CHARACTER_PROFILES:
            continue

        profile = CHARACTER_PROFILES[char_name]

        if custom_outfits and char_name in custom_outfits:
            outfit_desc = custom_outfits[char_name]
            outfit_label = "custom"
        else:
            outfit_desc = profile["outfits"].get(outfit_type, profile["outfits"].get("default", ""))
            outfit_label = outfit_type

        char_desc = f"""
{char_name}:
- Identity: {profile['identity']}
- Ethnicity: {profile.get('ethnicity', 'Asian')}"""

        if 'height' in profile:
            char_desc += f"\\n- Height: {profile['height']}"

        char_desc += f"""
- Hair: {profile.get('hair', 'Natural hair')}
- Face: {profile.get('face', 'Natural features')}"""

        if 'eyes' in profile:
            char_desc += f"\\n- Eyes: {profile['eyes']}"
        if 'skin' in profile:
            char_desc += f"\\n- Skin: {profile['skin']}"
        if 'distinctive' in profile:
            char_desc += f"\\n- DISTINCTIVE: {profile['distinctive']}"

        char_desc += f"\\n- Outfit ({outfit_label}): {outfit_desc}"

        char_descriptions.append(char_desc)

    setting_desc = SETTING_LAYOUTS.get(setting_type, SETTING_LAYOUTS["generic"])

    revision_instructions = ""
    if revision_commands:
        cmds = parse_natural_commands(revision_commands)

        if cmds["position_swap"]:
            chars = cmds["position_swap"]
            revision_instructions += f"\\n- POSITION SWAP: {chars[0]} and {chars[1]} swap positions/locations"

        if cmds["weather"]:
            revision_instructions += f"\\n- WEATHER: Change to {cmds['weather']} weather/atmosphere"

        if cmds["lighting"]:
            revision_instructions += f"\\n- LIGHTING: Make lighting {cmds['lighting']}"

        if cmds["color_tone"]:
            revision_instructions += f"\\n- COLOR TONE: Adjust to be {cmds['color_tone']}"

        if cmds["custom_action"]:
            revision_instructions += f"\\n- CUSTOM ACTION: {cmds['custom_action']}"

    color_matching = ""
    if match_color_tone and original_scene_ref:
        color_matching = """
COLOR TONE MATCHING (CRITICAL):
- Match the EXACT color palette from the reference scene image
- Copy the same color temperature (warm/cool tones)
- Maintain identical saturation levels
- Keep same lighting mood and atmosphere
- Preserve the same color grading style
- Reference scene shows the TARGET color tone to match"""

    enhanced_prompt = f"""SCENE DESCRIPTION:
{user_prompt}

{revision_instructions}

==============================================================================
PART 1: BACKGROUND LAYOUT (ABSOLUTE PRIORITY - LOCKED)
==============================================================================

SETTING: {setting_type.upper()}
{setting_desc}

CRITICAL BACKGROUND RULES:
1. Background layout is LOCKED - cannot change
2. All furniture/objects stay in EXACT positions
3. Room layout, walls, windows FIXED
4. Reference image shows EXACT background to copy
5. Background = UNCHANGING STAGE SET
6. Characters placed INTO this fixed background

==============================================================================
PART 2: CHARACTER DETAILS
==============================================================================

{''.join(char_descriptions)}

CONSISTENCY REQUIREMENTS:
1. Each character EXACTLY like reference images
2. Hair, outfit, features MUST match perfectly
3. Korean-Chinese features ONLY (NOT Western)
4. Character heights accurate (relative to each other)
5. Distinctly different from each other

==============================================================================
PART 3: ABSOLUTE RULES
==============================================================================

{color_matching}

MANDATORY:
1. Background layout: EXACT copy from setting reference
2. Character outfits: As specified above
3. Orientation: PORTRAIT (9:16 vertical)
4. Ethnicity: Korean-Chinese features only
5. Style: Photorealistic Korean drama cinematography
6. Text: Indonesian only (if any text appears)

GENERATION PROCESS:
Step 1: Copy EXACT background from setting reference
Step 2: Keep furniture/objects in SAME positions
Step 3: Place characters into locked background
Step 4: Apply character actions/poses
Step 5: Ensure portrait orientation

Generate VERTICAL portrait with LOCKED BACKGROUND and CONSISTENT COLOR TONE."""

    return enhanced_prompt

# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.route('/api/generate', methods=['POST'])
def generate_scene():
    """Generate scene image from prompt"""
    try:
        data = request.json
        prompt = data.get('prompt', '')
        filename = data.get('filename', 'scene.png')
        
        print(f"\\n{'='*70}")
        print(f"🎨 GENERATE: {filename}")
        print(f"{'='*70}")
        
        detected_chars = detect_characters_from_prompt(prompt)
        print(f"✅ Auto-detected characters: {detected_chars}")
        
        setting_type = detect_setting_smart(prompt, filename)
        print(f"✅ Setting: {setting_type}")
        
        content_parts = []
        
        def load_img(fp):
            with open(fp, 'rb') as f:
                return types.Part.from_bytes(data=f.read(), mime_type="image/png")
        
        sp = Path(SETTINGS_DIR) / f"{setting_type}.png"
        if sp.exists():
            content_parts.append(load_img(sp))
            print(f"✅ Setting ref loaded")
        
        for char_name, outfit_type in detected_chars.items():
            for v in ["front", "three_quarter"]:
                hp = Path(HEADSHOTS_DIR) / char_name / f"{v}.png"
                if hp.exists():
                    content_parts.append(load_img(hp))
                    print(f"✅ {char_name} headshot ({v})")
            
            for v in ["front", "back"]:
                op = Path(OUTFITS_DIR) / char_name / f"{outfit_type}_{v}.png"
                if op.exists():
                    content_parts.append(load_img(op))
                    print(f"✅ {char_name} outfit ({outfit_type}_{v})")
        
        print(f"📊 Total refs: {len(content_parts)}")
        
        enhanced = build_ultimate_prompt(
            user_prompt=prompt,
            detected_chars=detected_chars,
            setting_type=setting_type,
            match_color_tone=False
        )
        
        content_parts.insert(0, enhanced)
        
        print(f"🚀 Generating...")
        
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=content_parts,
            config=types.GenerateContentConfig(
                response_modalities=['IMAGE'],
                temperature=0.3,
                top_p=0.95,
                top_k=40,
            ),
        )
        
        if response.candidates[0].finish_reason != types.FinishReason.STOP:
            reason = response.candidates[0].finish_reason
            return jsonify({'error': f'Failed: {reason}'}), 500
        
        for part in response.candidates[0].content.parts:
            if part.thought:
                continue
            
            if part.inline_data:
                img_data = part.inline_data.data
                
                img = Image.open(BytesIO(img_data))
                w, h = img.size
                print(f"📐 Generated: {w}x{h}")
                
                if w > h:
                    new_w = int(h * 0.75)
                    left = (w - new_w) // 2
                    img = img.crop((left, 0, left + new_w, h))
                    buf = BytesIO()
                    img.save(buf, format='PNG')
                    img_data = buf.getvalue()
                    print(f"✂️ Cropped to portrait")
                
                output_path = Path(OUTPUT_DIR) / filename
                output_path.write_bytes(img_data)
                
                print(f"✅ SUCCESS: {filename}")
                print(f"{'='*70}\\n")
                
                return jsonify({
                    'success': True,
                    'filename': filename,
                    'message': f'Generated {filename}'
                })
        
        return jsonify({'error': 'No image generated'}), 500
        
    except Exception as e:
        print(f"\\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/regenerate', methods=['POST'])
def regenerate():
    """Regenerate scene with revisions"""
    try:
        data = request.json
        prompt = data.get('prompt')
        img_id = data.get('image_id')
        filename = data.get('filename', '')

        match = re.search(r'Chap[_\s](\d+)[_\s](\d+)', filename)
        if match:
            chapter_num = f"{match.group(1)}_{match.group(2)}"
            original_filename = f"Chap {match.group(1)}_{match.group(2)}.png"
        else:
            chapter_num = "unknown"
            original_filename = ""

        print(f"\\n{'='*70}")
        print(f"🎨 REGENERATE: {filename}")
        print(f"   Chapter: {chapter_num}")
        print(f"{'='*70}")

        frontend = data.get('characters', [])
        if frontend:
            detected_chars = {c['name']: c['outfit'] for c in frontend}
            print(f"✅ Characters: {detected_chars}")
        else:
            detected_chars = detect_characters_from_prompt(prompt)
            print(f"✅ Auto-detected: {detected_chars}")

        setting_type = detect_setting_smart(prompt, filename)
        print(f"✅ Setting: {setting_type}")

        revision_prompt = data.get('revision_prompt')
        if revision_prompt:
            print(f"✏️ Revision: {revision_prompt}")

        custom_outfits = data.get('custom_outfits')

        content_parts = []

        def load_img(fp):
            with open(fp, 'rb') as f:
                return types.Part.from_bytes(data=f.read(), mime_type="image/png")

        sp = Path(SETTINGS_DIR) / f"{setting_type}.png"
        if sp.exists():
            content_parts.append(load_img(sp))
            print(f"✅ Setting ref")

        nums = re.findall(r'\d+', filename)
        if len(nums) >= 2:
            current_chap = nums[0]
            current_scene = nums[1]

            for img in Path(ORIGINAL_SCENES_DIR).glob('*.png'):
                img_nums = re.findall(r'\d+', img.name)
                if len(img_nums) >= 2 and img_nums[:2] == [current_chap, current_scene]:
                    content_parts.append(load_img(img))
                    print(f"✅ Current scene: {img.name}")
                    break

        prev_scene_path = data.get('previous_scene_filepath')
        if prev_scene_path:
            pp = Path(prev_scene_path)
            if pp.exists():
                content_parts.append(load_img(pp))
                print(f"✅ Previous scene uploaded")

        for char_name, outfit_type in detected_chars.items():
            char_custom_dir = Path(CUSTOM_REFS_DIR) / char_name

            if char_custom_dir.exists():
                custom_headshots = sorted(char_custom_dir.glob("headshot_*.png"), 
                                        key=lambda x: x.stat().st_mtime, reverse=True)
                if custom_headshots:
                    content_parts.append(load_img(custom_headshots[0]))
                    print(f"✅ {char_name} CUSTOM headshot")
                    continue

            for v in ["front", "three_quarter"]:
                hp = Path(HEADSHOTS_DIR) / char_name / f"{v}.png"
                if hp.exists():
                    content_parts.append(load_img(hp))

            if char_custom_dir.exists():
                custom_outfits_list = sorted(char_custom_dir.glob(f"{outfit_type}_*.png"),
                                           key=lambda x: x.stat().st_mtime, reverse=True)
                if custom_outfits_list:
                    content_parts.append(load_img(custom_outfits_list[0]))
                    print(f"✅ {char_name} CUSTOM outfit")
                    continue

            for v in ["front", "back"]:
                op = Path(OUTFITS_DIR) / char_name / f"{outfit_type}_{v}.png"
                if op.exists():
                    content_parts.append(load_img(op))

        print(f"📊 Total refs: {len(content_parts)}")

        enhanced = build_ultimate_prompt(
            user_prompt=prompt,
            detected_chars=detected_chars,
            setting_type=setting_type,
            revision_commands=revision_prompt,
            custom_outfits=custom_outfits,
            original_scene_ref=(len(nums) >= 2),
            match_color_tone=True
        )

        content_parts.insert(0, enhanced)

        print(f"🚀 Generating...")

        response = client.models.generate_content(
            model=MODEL_ID,
            contents=content_parts,
            config=types.GenerateContentConfig(
                response_modalities=['IMAGE'],
                temperature=0.3,
                top_p=0.95,
                top_k=40,
            ),
        )

        if response.candidates[0].finish_reason != types.FinishReason.STOP:
            reason = response.candidates[0].finish_reason
            return jsonify({'error': f'Failed: {reason}'}), 500

        for part in response.candidates[0].content.parts:
            if part.thought:
                continue

            if part.inline_data:
                img_data = part.inline_data.data

                img = Image.open(BytesIO(img_data))
                w, h = img.size
                print(f"📐 Generated: {w}x{h}")

                if w > h:
                    new_w = int(h * 0.75)
                    left = (w - new_w) // 2
                    img = img.crop((left, 0, left + new_w, h))
                    buf = BytesIO()
                    img.save(buf, format='PNG')
                    img_data = buf.getvalue()
                    print(f"✂️ Cropped to portrait")

                output_filename = f"Chap_{chapter_num}_REGEN_{int(time.time())}.png"
                output_path = Path(OUTPUT_DIR) / output_filename
                output_path.write_bytes(img_data)

                should_overwrite = data.get('overwrite_original', False)
                if should_overwrite and original_filename:
                    overwrite_path = Path(ORIGINAL_SCENES_DIR) / original_filename
                    if overwrite_path.exists():
                        overwrite_path.write_bytes(img_data)
                        print(f"✅ OVERWRITTEN: {original_filename}")

                b64 = base64.b64encode(img_data).decode()

                print(f"✅ SUCCESS: {output_filename}")
                print(f"{'='*70}\\n")

                return jsonify({
                    'success': True,
                    'new_image_base64': f'data:image/png;base64,{b64}',
                    'filename': output_filename,
                    'overwritten': should_overwrite
                })

        return jsonify({'error': 'No image generated'}), 500

    except Exception as e:
        print(f"\\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload_previous_scene', methods=['POST'])
def upload_previous_scene():
    """Handle previous scene upload"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400

        file = request.files['file']
        temp_dir = Path("/content/temp_previous_scenes")
        temp_dir.mkdir(exist_ok=True, parents=True)

        filename = f"prev_{int(time.time())}.png"
        filepath = temp_dir / filename
        file.save(filepath)

        return jsonify({
            'success': True,
            'filepath': str(filepath),
            'filename': filename
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload_custom_reference', methods=['POST'])
def upload_custom_reference():
    """Upload custom reference image for a character"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400

        file = request.files['file']
        character = request.form.get('character')
        ref_type = request.form.get('ref_type', 'headshot')
        outfit_type = request.form.get('outfit_type', 'default')

        if not character:
            return jsonify({'error': 'Character name required'}), 400

        char_dir = Path(CUSTOM_REFS_DIR) / character
        char_dir.mkdir(exist_ok=True, parents=True)

        if ref_type == "outfit":
            filename = f"{outfit_type}_{int(time.time())}.png"
        elif ref_type == "headshot":
            filename = f"headshot_{int(time.time())}.png"
        else:
            filename = f"full_body_{int(time.time())}.png"

        filepath = char_dir / filename
        file.save(filepath)

        print(f"✅ Custom ref uploaded: {character}/{filename}")

        return jsonify({
            'success': True,
            'filepath': str(filepath),
            'character': character,
            'ref_type': ref_type,
            'filename': filename
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/save_approved', methods=['POST'])
def save_approved():
    """Save approved regenerated image"""
    try:
        data = request.json
        filename = data.get('filename')
        regenerated_base64 = data.get('regenerated_base64')
        overwrite = data.get('overwrite_original', False)

        if not filename or not regenerated_base64:
            return jsonify({'error': 'Missing data'}), 400

        if 'base64,' in regenerated_base64:
            img_data = base64.b64decode(regenerated_base64.split('base64,')[1])
        else:
            img_data = base64.b64decode(regenerated_base64)

        if overwrite:
            match = re.search(r'Chap[_\s](\d+)[_\s](\d+)', filename, re.IGNORECASE)
            if match:
                patterns = [
                    f"Chap {match.group(1)}_{match.group(2)}.png",
                    f"Chap_{match.group(1)}_{match.group(2)}.png",
                ]

                for pattern in patterns:
                    orig_path = Path(ORIGINAL_SCENES_DIR) / pattern
                    if orig_path.exists():
                        orig_path.write_bytes(img_data)
                        print(f"✅ OVERWRITTEN: {pattern}")
                        break

        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health')
def health():
    return jsonify({
        'status': 'ok',
        'backend': f'QC Backend V5 - {BOOK_NAME}',
        'book_id': BOOK_ID,
        'model': MODEL_ID,
        'characters': len(CHARACTER_PROFILES),
        'settings': len(SETTING_LAYOUTS),
        'custom_settings': len(CUSTOM_LAYOUTS),
        'features': [
            'Complete character profiles',
            'Smart setting detection',
            'Auto character detection',
            'Generation endpoint',
            'QC Studio regeneration',
            'Custom reference upload',
            'Natural language commands',
            'Color tone matching',
            'Auto-overwrite system'
        ]
    })

print(f"🚀 Starting...")
def run_flask():
    app.run(host='0.0.0.0', port=8920, use_reloader=False)

flask_thread = threading.Thread(target=run_flask, daemon=True)
flask_thread.start()

time.sleep(3)
try:
    os.system("fuser -k 1234/tcp 2>/dev/null")
    ngrok.kill()
except:
    pass

ngrok.set_auth_token(NGROK_TOKEN)
public_url = ngrok.connect(8920).public_url

print(f"\\n{'='*70}")
print(f"🌐 QC BACKEND V5 - {BOOK_NAME} READY!")
print(f"")
print(f"   URL: {public_url}")
print(f"   Book: {BOOK_ID}")
print(f"")
print(f"   📋 Available Endpoints:")
print(f"      POST /api/generate")
print(f"      POST /api/regenerate")
print(f"      POST /api/upload_previous_scene")
print(f"      POST /api/upload_custom_reference")
print(f"      POST /api/save_approved")
print(f"      GET  /health")
print(f"")
print(f"   ✨ Book Config:")
print(f"      📚 Characters: {len(CHARACTER_PROFILES)}")
print(f"      🏠 Settings: {len(SETTING_LAYOUTS)} ({len(CUSTOM_LAYOUTS)} custom)")
print(f"")
print(f"{'='*70}\\n")

while True:
    time.sleep(1)
`;

// --- Types ---

interface RawCharacter {
  raw_desc: string[];
  raw_outfits: Record<string, string>;
}

interface EnrichedCharacter {
  height: string;
  ethnicity: string;
  face: string;
  eyes: string;
  skin: string;
  hair: string;
  outfits: Record<string, string>;
}

interface SettingMapping {
  raw_text: string;
  backend_key: string;
  layout_desc: string;
  is_new: boolean;
}

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

// --- Styles ---

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
  },
  sidebar: {
    width: '400px',
    backgroundColor: 'var(--bg-panel)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '20px',
    overflowY: 'auto' as const,
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    padding: '15px 20px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'var(--bg-panel)',
  },
  title: {
    margin: 0,
    fontSize: '1.2rem',
    fontWeight: 600,
    color: 'var(--accent)',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    fontWeight: 500,
  },
  input: {
    width: '100%',
    padding: '10px',
    backgroundColor: 'var(--bg-dark)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-main)',
    fontSize: '0.9rem',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    padding: '10px',
    backgroundColor: 'var(--bg-dark)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: 'var(--text-main)',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: '200px',
    flex: 1,
  },
  button: {
    padding: '10px 20px',
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 600,
    transition: 'background 0.2s',
  },
  secondaryButton: {
    padding: '6px 12px',
    backgroundColor: 'var(--border)',
    color: 'var(--text-main)',
    border: '1px solid var(--text-muted)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'background 0.2s',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
    marginBottom: '15px',
  },
  tab: (active: boolean) => ({
    padding: '8px 16px',
    cursor: 'pointer',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--text-main)' : 'var(--text-muted)',
    fontWeight: 500,
    fontSize: '0.9rem',
  }),
  editor: {
    flex: 1,
    backgroundColor: '#1e1e2e',
    color: '#a9b1d6',
    padding: '20px',
    overflow: 'auto',
    fontFamily: 'monospace',
    whiteSpace: 'pre' as const,
    fontSize: '14px',
    lineHeight: '1.5',
  },
  console: {
    height: '200px',
    backgroundColor: '#151520',
    borderTop: '1px solid var(--border)',
    padding: '10px',
    overflowY: 'auto' as const,
    fontFamily: 'monospace',
    fontSize: '12px',
  },
  logLine: (type: string) => ({
    marginBottom: '4px',
    color: type === 'error' ? 'var(--error)' : type === 'success' ? 'var(--success)' : '#a0a0a9',
  }),
  badge: {
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    backgroundColor: 'var(--border)',
    marginLeft: '8px',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  }
};

// --- Helper Logic (The "Script" Part) ---

const parseVisualDescription = (text: string): Record<string, RawCharacter> => {
  const lines = text.split('\n');
  const rawChars: Record<string, RawCharacter> = {};
  let currentChar: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect Name (Lines without bullets, short, no URL)
    if (!trimmed.startsWith('*') && trimmed.length < 30 && !trimmed.startsWith('(') && !trimmed.startsWith('http') && !trimmed.includes(':')) {
      currentChar = trimmed;
      if (!rawChars[currentChar]) {
        rawChars[currentChar] = { raw_desc: [], raw_outfits: {} };
      }
    }
    // Detect Attributes/Outfits
    else if (trimmed.startsWith('*') && currentChar) {
      const content = trimmed.substring(1).trim();
      const lowerContent = content.toLowerCase();

      if (content.includes(':') && (lowerContent.includes('baju') || lowerContent.includes('outfit'))) {
        const parts = content.split(':');
        let category = parts[0].replace(/baju|outfit/gi, '').trim().toLowerCase();
        const desc = parts.slice(1).join(':').trim();

        // Standardize keys
        if (category.includes('default')) category = 'default';
        else if (category.includes('santai')) category = 'casual';
        else if (category.includes('tidur')) category = 'sleepwear';
        else if (category.includes('formal')) category = 'formal';
        else category = category.replace(/\s+/g, '_');

        rawChars[currentChar].raw_outfits[category] = desc;
      } else {
        rawChars[currentChar].raw_desc.push(content);
      }
    }
    // Handle user paste format that might not have asterisks
    else if (currentChar && (trimmed.toLowerCase().startsWith("baju") || trimmed.toLowerCase().startsWith("outfit"))) {
         const content = trimmed;
         const parts = content.split(':');
         if (parts.length > 1) {
             let category = parts[0].replace(/baju|outfit/gi, '').trim().toLowerCase();
             const desc = parts.slice(1).join(':').trim();
             
              // Standardize keys
            if (category.includes('default')) category = 'default';
            else if (category.includes('santai')) category = 'casual';
            else if (category.includes('tidur')) category = 'sleepwear';
            else if (category.includes('formal')) category = 'formal';
            else category = category.replace(/\s+/g, '_');
            
            rawChars[currentChar].raw_outfits[category] = desc;
         }
    }
  }
  return rawChars;
};

const parseBookSettings = (text: string): string[] => {
  // Regex to catch [Insert Background], [Setting], etc.
  // We want to capture the text AFTER the tag until the end of line or bracket closure
  const regexes = [
    /\[Insert Background\]\s*([^\[\n]+)/gi,
    /\[Setting\]\s*([^\[\n]+)/gi,
    /\[Insert image\]\s*Setting\s([^.,\n]+)/gi
  ];

  const foundSettings = new Set<string>();
  
  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const clean = match[1].trim();
      if (clean.length > 2) { // Filter noise
        foundSettings.add(clean);
      }
    }
  }
  return Array.from(foundSettings);
};

// PATCHER ENGINE UTILITIES
const formatPythonDict = (obj: any): string => {
  return JSON.stringify(obj, null, 4)
    .replace(/true/g, 'True')
    .replace(/false/g, 'False')
    .replace(/null/g, 'None');
};

const patchSection = (template: string, patchName: string, content: string): string => {
  const startMarker = `# <<<PATCH:${patchName}>>>`;
  const endMarker = `# <<<END_PATCH:${patchName}>>>`;
  
  const parts = template.split(startMarker);
  if (parts.length < 2) return template; // Marker not found
  
  const endParts = parts[1].split(endMarker);
  if (endParts.length < 2) return template; // End marker not found

  return parts[0] + startMarker + "\n" + content + "\n" + endMarker + endParts[1];
};

const cleanJsonString = (str: string) => {
  // Remove ```json and ``` wrapping if present
  let clean = str.trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace('```json', '').replace('```', '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace('```', '').replace('```', '');
  }
  return clean.trim();
}

// --- App Component ---

const App = () => {
  // Config State
  const [bookId, setBookId] = useState('005');
  const [bookName, setBookName] = useState('My Childhood Enemy Becomes my Roommate');
  
  // Input State
  const [activeTab, setActiveTab] = useState<'visual' | 'content'>('visual');
  const [visualDesc, setVisualDesc] = useState('');
  const [bookContent, setBookContent] = useState('');
  
  // Output State
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-scroll console
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message, type }]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    addLog(`Reading file: ${file.name}...`, 'info');
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (activeTab === 'visual') {
        setVisualDesc(content);
        addLog(`Loaded visual description from ${file.name}`, 'success');
      } else {
        setBookContent(content);
        addLog(`Loaded book content from ${file.name}`, 'success');
      }
    };
    reader.onerror = () => {
      addLog(`Failed to read file: ${file.name}`, 'error');
    };
    reader.readAsText(file);
    
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const generateBackend = async () => {
    if (!process.env.API_KEY) {
      addLog("API KEY not found in environment variables", 'error');
      return;
    }

    setIsGenerating(true);
    setLogs([]); // Clear logs
    setGeneratedCode('');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const modelId = "gemini-2.5-flash"; // Efficient for data processing

      // 1. Parsing Input
      addLog("Step 1: Parsing Raw Inputs...", 'info');
      // We pass the raw text to the prompt now to let the LLM do the heavy parsing lifting as well
      // But we still do a basic check
      
      if (!visualDesc.trim()) {
        throw new Error("Visual Description is empty!");
      }

      addLog("Scanning Book Content for Settings...", 'info');
      const rawSettings = parseBookSettings(bookContent);
      if (rawSettings.length === 0) {
        addLog("No settings tags found in content. Using defaults.", 'info');
      } else {
        addLog(`Found ${rawSettings.length} unique setting references.`, 'success');
      }

      // 2. STAGE 1: CHARACTER PROFILES (Strict Mode)
      addLog("Step 2: Generating Character Profiles (Strict Mode)...", 'info');
      
      const charPrompt = `
        You are a strict Data Extraction Engine.
        
        INPUT DATA:
        ${visualDesc}

        TASK: 
        Convert the raw character descriptions above into a structured JSON format.
        
        CRITICAL RULES (OUTFIT PARSING):
        1. **Handle Overlaps**: If a character has BOTH "Baju santai" AND "Baju casual", extract BOTH as separate keys.
           - Map "Baju santai" -> "relaxed"
           - Map "Baju casual" -> "casual"
           - If ONLY one exists, map to "casual".
        2. **Strict Extraction**: Extract ALL mentioned outfits (Default, Formal, Patient, Sleepwear, Work, etc.).

        CRITICAL RULES (ACCESSORY INJECTION):
        1. You MUST AUTOMATICALLY ADD 1 specific luxury accessory to EVERY outfit based on the character's Age and Gender.
        2. Append this accessory to the end of the outfit string in natural language.
        3. **Logic**:
           - **Male (30s+)**: Luxury Watches (ROLEX, PATEK PHILIPPE, HUBOLT, OMEGA), Leather belts, Cufflinks.
           - **Male (20s)**: Smart watches (APPLE WATCH), Silver chains, Trendy bracelets, TAG HEUER.
           - **Female (20s-30s)**: Necklaces (CARTIER, VAN CLEEF, TIFFANY, COSMOS), Earrings (DIAMOND studs, PEARL drop), Bracelets (HERMES, CHARM).
           - **Default Outfit**: Use ultra-premium brands (PATEK PHILIPPE, CARTIER).
           - **Formal**: Use classic luxury (ROLEX, DIAMOND).
           - **Casual/Relaxed**: Use trendy luxury (APPLE WATCH, SILVER chain, COSMOS necklace).
        4. **Variety**: Do not use the same accessory for every outfit. Mix brands and types suitable for the style.

        CRITICAL RULES (FORMATTING):
        1. **Natural Language**: "WHITE shirt, NAVY ankle pants, SILVER ROLEX watch". NO weights like (item:1.2).
        2. **UPPERCASE** colors and brands for emphasis.

        OUTPUT JSON FORMAT:
        {
          "CharacterName": {
            "identity": "Short bio string",
            "height": "1xxcm",
            "ethnicity": "Korean/Chinese",
            "face": "...",
            "eyes": "...",
            "hair": "...",
            "outfits": { 
                "default": "COLOR item, COLOR item, LUXURY BRAND ACCESSORY", 
                "casual": "COLOR item, COLOR item, LUXURY BRAND ACCESSORY",
                "relaxed": "COLOR item, COLOR item, LUXURY BRAND ACCESSORY",
                "formal": "COLOR item, COLOR item, LUXURY BRAND ACCESSORY"
            }
          }
        }
      `;

      const charResponse = await ai.models.generateContent({
        model: modelId,
        contents: charPrompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const cleanedCharJson = cleanJsonString(charResponse.text || "{}");
      let enrichedProfiles = {};
      try {
        enrichedProfiles = JSON.parse(cleanedCharJson);
      } catch (e) {
         addLog(`JSON Parsing Error (Chars): ${e}`, 'error');
         throw new Error("Failed to parse Character JSON from AI");
      }
      
      // Validation Log
      const charCount = Object.keys(enrichedProfiles).length;
      if (charCount === 0) throw new Error("AI returned empty character profile!");
      
      addLog(`✅ Generated ${charCount} profiles.`, 'success');
      Object.entries(enrichedProfiles).forEach(([name, data]: [string, any]) => {
          const outfitKeys = Object.keys(data.outfits || {});
          addLog(`   👤 ${name}: Found ${outfitKeys.length} outfits (${outfitKeys.join(', ')})`, 'info');
      });


      // 3. STAGE 2: SETTINGS (Normalization)
      addLog("Step 3: Normalizing Settings...", 'info');
      
      const settingPrompt = `
        You are a Setting Standardization Expert.
        Raw Settings Found: ${JSON.stringify(rawSettings)}

        Task: Map these raw text references to standard backend keys (snake_case).
        If a setting seems standard (e.g., "kamar", "kantor"), map to a logical key like "bedroom", "office".
        If it's specific (e.g., "Kamar MC"), create a specific key ("mc_bedroom").
        Also provide a visual layout description for Stable Diffusion.

        Output JSON format (Array):
        [
          {
            "raw_text": "original text found",
            "backend_key": "standardized_snake_case_key",
            "layout_desc": "Visual description of the room layout, furniture, lighting",
            "is_new": true/false (true if it needs a custom layout definition)
          }
        ]
      `;

      const settingResponse = await ai.models.generateContent({
        model: modelId,
        contents: settingPrompt,
        config: { responseMimeType: "application/json" }
      });

      const cleanedSettingJson = cleanJsonString(settingResponse.text || "[]");
      let normalizedSettings: SettingMapping[] = [];
      try {
          normalizedSettings = JSON.parse(cleanedSettingJson);
      } catch (e) {
          addLog(`JSON Parsing Error (Settings): ${e}`, 'error');
          normalizedSettings = []; // Fallback
      }

      addLog(`✅ Mapped ${normalizedSettings.length} settings.`, 'success');

      // 4. STAGE 3: PATCHING
      addLog("Step 4: Assembling Backend Script...", 'info');

      // Transform settings to Map & Layouts
      const settingMap: Record<string, string> = {};
      const customLayouts: Record<string, string> = {};
      
      normalizedSettings.forEach(s => {
        settingMap[s.raw_text] = s.backend_key;
        if (s.is_new || !["generic", "hospital_vip", "hospital_regular", "hospital_corridor", "apartment_living_room", "apartment_bedroom", "apartment_kitchen", "office_workspace", "cafe_interior", "park_outdoor", "mall_interior", "car_interior", "street_exterior", "restaurant"].includes(s.backend_key)) {
             customLayouts[s.backend_key] = s.layout_desc;
        }
      });

      // Patching Master Template
      let finalCode = MASTER_TEMPLATE;

      // Patch: BOOK_INFO
      const bookInfoBlock = `BOOK_ID = "${bookId}"\nBOOK_NAME = "${bookName}"\nGENERATION_DATE = "${new Date().toISOString()}"`;
      finalCode = patchSection(finalCode, "BOOK_INFO", bookInfoBlock);
      
      // Patch: CHARACTER_PROFILES
      finalCode = patchSection(finalCode, "CHARACTER_PROFILES", `CHARACTER_PROFILES = ${formatPythonDict(enrichedProfiles)}`);

      // Patch: SETTING_KEYWORD_MAP
      finalCode = patchSection(finalCode, "SETTING_KEYWORD_MAP", `SETTING_KEYWORD_MAP = ${formatPythonDict(settingMap)}`);

      // Patch: CUSTOM_LAYOUTS
      finalCode = patchSection(finalCode, "CUSTOM_LAYOUTS", `CUSTOM_LAYOUTS = ${formatPythonDict(customLayouts)}`);

      setGeneratedCode(finalCode);
      addLog("🎉 Backend generation complete!", 'success');

    } catch (error: any) {
      console.error(error);
      addLog(`CRITICAL ERROR: ${error.message}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([generatedCode], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qc_backend_${bookId}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.container}>
      {/* Sidebar: Configuration & Inputs */}
      <div style={styles.sidebar}>
        <div style={styles.inputGroup}>
          <h2 style={styles.title}>Backend Patcher V5</h2>
          <p style={{fontSize: '0.8rem', color: '#7aa2f7'}}>Strict Mode: Outfit Fidelity</p>
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Book ID</label>
          <input 
            style={styles.input} 
            value={bookId} 
            onChange={(e) => setBookId(e.target.value)} 
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Book Name</label>
          <input 
            style={styles.input} 
            value={bookName} 
            onChange={(e) => setBookName(e.target.value)} 
          />
        </div>

        <div style={styles.tabs}>
          <div 
            style={styles.tab(activeTab === 'visual')} 
            onClick={() => setActiveTab('visual')}
          >
            Visual Description
          </div>
          <div 
            style={styles.tab(activeTab === 'content')} 
            onClick={() => setActiveTab('content')}
          >
            Book Content
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* File Upload Toolbar */}
          <div style={styles.toolbar}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Source: {activeTab === 'visual' ? 'Visual Desc' : 'Chapter Scripts'}
            </span>
            <input 
              type="file" 
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".txt,.md,.json"
              onChange={handleFileUpload}
            />
            <button style={styles.secondaryButton} onClick={triggerFileUpload}>
              📂 Upload File
            </button>
          </div>

          <textarea
            style={styles.textarea}
            placeholder={activeTab === 'visual' 
              ? "Paste visual description text here (e.g. 'MC... Baju default...')..." 
              : "Paste chapter content here (e.g. '[Setting] Room...')..."}
            value={activeTab === 'visual' ? visualDesc : bookContent}
            onChange={(e) => activeTab === 'visual' ? setVisualDesc(e.target.value) : setBookContent(e.target.value)}
          />
        </div>

        <div style={{ marginTop: '20px' }}>
          <button 
            style={{ ...styles.button, ...(isGenerating || !visualDesc ? styles.buttonDisabled : {}) }}
            onClick={generateBackend}
            disabled={isGenerating || !visualDesc}
          >
            {isGenerating ? 'Processing...' : 'Generate Backend Script'}
          </button>
        </div>
      </div>

      {/* Main Content: Output & Console */}
      <div style={styles.mainContent}>
        <div style={styles.header}>
          <span style={styles.title}>
            Output: qc_backend_{bookId}.py
            {generatedCode && <span style={styles.badge}>Generated</span>}
          </span>
          {generatedCode && (
            <button style={styles.button} onClick={handleDownload}>
              Download .py
            </button>
          )}
        </div>

        <div style={styles.editor}>
          {generatedCode || "// Python script will appear here after generation..."}
        </div>

        {/* Console Panel */}
        <div style={styles.console} ref={consoleRef}>
          <div style={{color: '#7aa2f7', fontWeight: 'bold', marginBottom: '8px'}}>System Log:</div>
          {logs.length === 0 && <div style={{color: '#555'}}>Ready to generate...</div>}
          {logs.map((log, idx) => (
            <div key={idx} style={styles.logLine(log.type)}>
              <span style={{opacity: 0.5}}>[{log.timestamp}]</span> {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);