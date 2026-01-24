#!/usr/bin/env python3
"""
Script pour renommer les fichiers de public/objet2 en français
Usage: python3 scripts/rename-objet2.py [--dry-run]
"""

import os
import sys
import re
from pathlib import Path

def translate_filename(filename):
    """Traduit un nom de fichier anglais en français"""
    
    # Dictionnaire de traductions directes
    direct_translations = {
        'Cat.png': 'chat.png',
        'Chicken.png': 'poulet.png',
        'Horseshoe.png': 'fer-cheval.png',
        'Yoke.png': 'joug.png',
        'Bucket.png': 'seau.png',
        'Bathtub.png': 'baignoire.png',
        'Crib.png': 'berceau.png',
        'Gong.png': 'gong.png',
        'Pitcher.png': 'pichet.png',
        'Scroll.png': 'parchemin.png',
        'Lantern.png': 'lanterne.png',
        'Piano.png': 'piano.png',
        'Stove.png': 'poele.png',
        'Well.png': 'puits.png',
        'Cabinet.png': 'armoire.png',
    }
    
    if filename in direct_translations:
        return direct_translations[filename]
    
    # Règles de pattern
    patterns = [
        (r'^Banner (\d+)([ab]?)\.png$', r'banniere-\1\2.png'),
        (r'^Bomb (\d+)\.png$', r'bombe-\1.png'),
        (r'^Cage (\d+)\.png$', r'cage-\1.png'),
        (r'^Ladder (\d+)\.png$', r'echelle-\1.png'),
        (r'^Sack Barricade[_ ](\d+)\.png$', r'barricade-sacs-\1.png'),
        (r'^Sack Barricade[_ ]seamless\.png$', r'barricade-sacs-seamless.png'),
        (r'^Sack Barricade[_ ]seamless[_ ](cap|start)\.png$', r'barricade-sacs-seamless-\1.png'),
        (r'^Spiked Barricade[_ ](\d+)\.png$', r'barricade-pieux-\1.png'),
        (r'^Spiked Barricade[_ ]seamless\.png$', r'barricade-pieux-seamless.png'),
        (r'^Spiked Barricade[_ ]seamless[_ ](cap|start)\.png$', r'barricade-pieux-seamless-\1.png'),
        (r'^Staked Head (\d+)\.png$', r'tete-empalee-\1.png'),
        (r'^Training Target (\d+)\.png$', r'cible-entrainement-\1.png'),
        (r'^Wooden Gatehouse (\d+)\.png$', r'porte-bois-\1.png'),
        (r'^Wooden Wall Piece[_ ]destroyed\.png$', r'mur-bois-detruit.png'),
        
        # Farm
        (r'^Basin (\d+)\.png$', r'bassin-\1.png'),
        (r'^Farm Tool (\d+)\.png$', r'outil-ferme-\1.png'),
        (r'^Fence (\d+)\.png$', r'cloture-\1.png'),
        (r'^Fence Part (\d+)\.png$', r'cloture-partie-\1.png'),
        (r'^Fence[_ ]corner\.png$', r'cloture-coin.png'),
        (r'^Fieldstone Wall (\d+)\.png$', r'mur-pierre-\1.png'),
        (r'^Fieldstone[_ ](T|X|corner)\.png$', r'mur-pierre-\1.png'),
        (r'^Horse (\d+)([ab]?)\.png$', r'cheval-\1\2.png'),
        (r'^Logs (\d+)\.png$', r'rondins-\1.png'),
        (r'^Plot (\d+)\.png$', r'parcelle-\1.png'),
        (r'^Plot[_ ]filled (\d+)\.png$', r'parcelle-cultivee-\1.png'),
        (r'^Plow (\d+)\.png$', r'charrue-\1.png'),
        (r'^Sack (\d+)\.png$', r'sac-\1.png'),
        (r'^Scarecrow (\d+)\.png$', r'epouvantail-\1.png'),
        (r'^Straw Pile\.png$', r'tas-paille.png'),
        (r'^Tall Grass (\d+)\.png$', r'herbe-haute-\1.png'),
        (r'^Tree Stump (\d+)\.png$', r'souche-arbre-\1.png'),
        (r'^Wagon (\d+)\.png$', r'chariot-\1.png'),
        (r'^Wagon Wheel (\d+)\.png$', r'roue-chariot-\1.png'),
        (r'^Well (\d+)\.png$', r'puits-\1.png'),
        
        # Fourniture
        (r'^Animal Pelt (\d+)([ab]?)\.png$', r'peau-animal-\1\2.png'),
        (r'^Armchair (\d+)([ab]?)\.png$', r'fauteuil-\1\2.png'),
        (r'^Bar (\d+)\.png$', r'bar-\1.png'),
        (r'^Barrel (\d+)\.png$', r'tonneau-\1.png'),
        (r'^Barrel Cask\.png$', r'tonneau-fut.png'),
        (r'^Barrel[_ ](empty|full|side)\.png$', r'tonneau-\1.png'),
        (r'^Basket (\d+)\.png$', r'panier-\1.png'),
        (r'^Bed (\d+)([abc]?)\.png$', r'lit-\1\2.png'),
        (r'^Bench (\d+)\.png$', r'banc-\1.png'),
        (r'^Booth (\d+)([ab]?)\.png$', r'box-\1\2.png'),
        (r'^Cabinet (\d+)\.png$', r'armoire-\1.png'),
        (r'^Carpet (\d+)([ab]?)\.png$', r'tapis-\1\2.png'),
        (r'^Cauldron (\d+)([abc]?)\.png$', r'chaudron-\1\2.png'),
        (r'^Cellar Door\.png$', r'porte-cave.png'),
        (r'^Chair (\d+)([ab]?)\.png$', r'chaise-\1\2.png'),
        (r'^Chair (\d+) \(D\)\.png$', r'chaise-\1-cassee.png'),
        (r'^Chest (\d+)([ab]?)\.png$', r'coffre-\1\2.png'),
        (r'^Church Pew\.png$', r'banc-eglise.png'),
        (r'^Couch (\d+)([ab]?)\.png$', r'canape-\1\2.png'),
        (r'^Crate (\d+)\.png$', r'caisse-\1.png'),
        (r'^Cupboard (\d+)\.png$', r'placard-\1.png'),
        (r'^Cupboard (\d+) \(D\)\.png$', r'placard-\1-detruit.png'),
        (r'^Curtain (\d+)\.png$', r'rideau-\1.png'),
        (r'^Cutlery (\d+)\.png$', r'couverts-\1.png'),
        (r'^Door (\d+)\.png$', r'porte-\1.png'),
        (r'^Drink Cart\.png$', r'chariot-boissons.png'),
        (r'^Furnished Table (\d+)\.png$', r'table-garnie-\1.png'),
        (r'^Hand Bellow\.png$', r'soufflet-main.png'),
        (r'^Hearth\.png$', r'foyer.png'),
        (r'^Hearth \(lit\)\.png$', r'foyer-allume.png'),
        (r'^Kindling\.png$', r'petit-bois.png'),
        (r'^Kitchen Knife\.png$', r'couteau-cuisine.png'),
        (r'^Lantern (\d+)\.png$', r'lanterne-\1.png'),
        (r'^Lounge Table (\d+)\.png$', r'table-basse-\1.png'),
        (r'^Lounge Table (\d+) \(D\)\.png$', r'table-basse-\1-detruite.png'),
        (r'^Mirror ([ab])\.png$', r'miroir-\1.png'),
        (r'^Piano Bench\.png$', r'banc-piano.png'),
        (r'^Pillow (\d+)([abc])\.png$', r'oreiller-\1\2.png'),
        (r'^Plant (\d+)\.png$', r'plante-\1.png'),
        (r'^Pot (\d+)\.png$', r'pot-\1.png'),
        (r'^Shelf (\d+)\.png$', r'etagere-\1.png'),
        (r'^Shelf (\d+) \(D\)\.png$', r'etagere-\1-detruit.png'),
        (r'^Shelf (\d+)\([AB]\)\.png$', r'etagere-\1\1.png'),
        (r'^Side Table (\d+)\.png$', r'table-appoint-\1.png'),
        (r'^Side Table (\d+) \(D\)\.png$', r'table-appoint-\1-detruite.png'),
        (r'^Spoon (\d+)\.png$', r'cuillere-\1.png'),
        (r'^Staircase (\d+)\.png$', r'escalier-\1.png'),
        (r'^Stool (\d+)\.png$', r'tabouret-\1.png'),
        (r'^Stool (\d+) \(D\)\.png$', r'tabouret-\1-detruit.png'),
        (r'^Swinging Door\.png$', r'porte-battante.png'),
        (r'^Table (\d+)\.png$', r'table-\1.png'),
        (r'^Table (\d+) \(D\)\.png$', r'table-\1-detruite.png'),
        (r'^Trophy (\d+)\.png$', r'trophee-\1.png'),
        (r'^Wall Hook (\d+)\.png$', r'crochet-mural-\1.png'),
        (r'^Wood Pile\.png$', r'tas-bois.png'),
        (r'^Wooden Seat (\d+)\.png$', r'siege-bois-\1.png'),
        (r'^Wooden Seat (\d+) \(D\)\.png$', r'siege-bois-\1-detruit.png'),
        
        # Candles & Candelabra
        (r'^Candle (\d+)\.png$', r'bougie-\1.png'),
        (r'^Candle (\d+) \(lit\)\.png$', r'bougie-\1-allumee.png'),
        (r'^Candelabra (\d+)\.png$', r'candelabre-\1.png'),
        (r'^Candelabra (\d+) \(lit\)\.png$', r'candelabre-\1-allume.png'),
        
        # Marché / Market
        (r'^Stall[_ ]food (\d+)\.png$', r'etalage-nourriture-\1.png'),
        (r'^Stall (\d+)\.png$', r'etalage-\1.png'),
        (r'^Jewelery (\d+)\.png$', r'bijouterie-\1.png'),
        (r'^Equipment (\d+)\.png$', r'equipement-\1.png'),
        (r'^Tent (\d+)\.png$', r'tente-\1.png'),
        (r'^Pottery (\d+)\.png$', r'poterie-\1.png'),
        (r'^Fabric (\d+)\.png$', r'tissu-\1.png'),
        (r'^Barrel (\d+)\.png$', r'tonneau-\1.png'),
        (r'^Crate (\d+)\.png$', r'caisse-\1.png'),
        (r'^Wagon (\d+) \(filled\)\.png$', r'chariot-\1-rempli.png'),
    ]
    
    # Essayer les patterns
    for pattern, replacement in patterns:
        match = re.match(pattern, filename, re.IGNORECASE)
        if match:
            return re.sub(pattern, replacement, filename, flags=re.IGNORECASE).lower()
    
    # Règles spéciales pour les noms composés
    translations = {
        'Gate Open': 'porte-ouverte',
        'Gate Closed': 'porte-fermee',
        'Barrel empty': 'tonneau-vide',
        'Barrel full': 'tonneau-plein',
        'Barrel side': 'tonneau-cote',
    }
    
    base = filename[:-4]  # Enlever .png
    if base in translations:
        return translations[base] + '.png'
    
    # Traductions de noms composés avec patterns
    complex_patterns = [
        (r'^Standing[_ ](.+)$', lambda m: f'debout-{m.group(1).lower().replace(" ", "-")}'),
        (r'^Crop[_ ](.+) ([ABC])$', lambda m: f'culture-{translate_crop(m.group(1))}-{m.group(2).lower()}'),
        (r'^Livestock[_ ](.+) ([ABC])$', lambda m: f'betail-{translate_animal(m.group(1))}-{m.group(2).lower()}'),
        (r'^Food[_ ](.+)$', lambda m: f'nourriture-{translate_food(m.group(1))}'),
        (r'^Siege Weapon - (.+)$', lambda m: f'arme-siege-{translate_siege_weapon(m.group(1))}'),
        (r'^Weapon Rack[_ ](empty|filled) (\d+)$', lambda m: f'support-armes-{"vide" if m.group(1) == "empty" else "plein"}-{m.group(2)}'),
        (r'^Tent[_ ]rugged (\d+)([ab]?)$', lambda m: f'tente-robuste-{m.group(1)}{m.group(2)}'),
        (r'^Scale - (.+)$', lambda m: f'balance-{m.group(1).lower()}'),
    ]
    
    for pattern, func in complex_patterns:
        match = re.match(pattern, base, re.IGNORECASE)
        if match:
            return func(match) + '.png'
    
    # Par défaut, normaliser
    return filename.lower().replace(' ', '-').replace('_', '-')

def translate_crop(crop):
    crops = {'Beans': 'haricots', 'Berries': 'baies', 'Peas': 'pois', 'Wheat': 'ble'}
    return crops.get(crop, crop.lower())

def translate_animal(animal):
    animals = {'Cow': 'vache', 'Goat': 'chevre', 'Pig': 'cochon', 'Sheep': 'mouton'}
    return animals.get(animal, animal.lower())

def translate_food(food):
    foods = {
        'potatoes': 'pommes-terre',
        'apples': 'pommes',
        'lettuce': 'laitue',
        'cabbage': 'chou',
    }
    # Gérer "fish 1", "fish 2", etc.
    parts = food.split()
    if len(parts) == 2 and parts[0].lower() == 'fish':
        return f'poisson-{parts[1]}'
    return foods.get(food.lower(), food.lower().replace(' ', '-'))

def translate_siege_weapon(weapon):
    weapons = {
        'Ballista 1': 'baliste-1',
        'Ballista 2': 'baliste-2',
        'Battering Ram 1': 'belier-1',
        'Cannon 1': 'canon-1',
        'Cannon 2': 'canon-2',
        'Mangonel 1': 'mangonneau-1',
        'Mangonel 2': 'mangonneau-2',
        'Rocketeer 1': 'roquette-1',
        'Sling': 'fronde',
        'Trebuchet': 'trebuchet',
        'War Wagon': 'chariot-guerre',
        'War Wagon_cannons': 'chariot-guerre-canons',
        'War Wagon_ram': 'chariot-guerre-belier',
        'War Wagon_ram2': 'chariot-guerre-belier2',
    }
    return weapons.get(weapon, weapon.lower().replace(' ', '-'))

def main():
    dry_run = '--dry-run' in sys.argv
    
    print('🏷️  Renommage des Objets en Français')
    print('=' * 40)
    print()
    
    if dry_run:
        print('⚠️  DRY RUN MODE - No files will be renamed\n')
    
    objet2_dir = Path('public/objet2')
    
    if not objet2_dir.exists():
        print(f'❌ Directory {objet2_dir} not found!')
        sys.exit(1)
    
    # Scan tous les fichiers PNG
    mappings = []
    for png_file in objet2_dir.rglob('*.png'):
        if png_file.name.startswith('.'):
            continue
        
        new_name = translate_filename(png_file.name)
        if new_name != png_file.name:
            new_path = png_file.parent / new_name
            mappings.append((png_file, new_path, png_file.name, new_name))
    
    print(f'✅ Found {len(mappings)} files to rename\n')
    
    # Category breakdown
    categories = {}
    for old_path, _, _, _ in mappings:
        category = old_path.parent.name
        categories[category] = categories.get(category, 0) + 1
    
    print('📊 Category breakdown:')
    for cat in sorted(categories.keys()):
        print(f'  • {cat}: {categories[cat]} files')
    print()
    
    if dry_run:
        print('📋 Sample renamings:')
        for old_path, _, old_name, new_name in mappings[:20]:
            print(f'  {old_name} → {new_name}')
        if len(mappings) > 20:
            print(f'  ... and {len(mappings) - 20} more')
        print('\n✅ Dry run complete!')
        return
    
    # Renommage
    print('📝 Renaming files...\n')
    success_count = 0
    error_count = 0
    
    for i, (old_path, new_path, old_name, new_name) in enumerate(mappings, 1):
        progress = f'[{i}/{len(mappings)}]'
        try:
            print(f'{progress} {old_name} → {new_name}... ', end='')
            old_path.rename(new_path)
            success_count += 1
            print('✅')
        except Exception as e:
            error_count += 1
            print(f'❌ {e}')
    
    print(f'\n📊 Rename Summary:')
    print(f'  ✅ Success: {success_count}')
    print(f'  ❌ Errors: {error_count}')
    print('\n🎉 Renaming complete!')

if __name__ == '__main__':
    main()
