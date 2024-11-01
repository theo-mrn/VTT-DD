import json
import os

def modifier_fichiers_existants(fichier_source, prefixe_fichier):
    # Charger le fichier source depuis le sous-dossier "tabs"
    fichier_source_path = os.path.join("tabs", fichier_source)
    
    # Vérifier si le fichier existe dans "tabs"
    if not os.path.exists(fichier_source_path):
        print(f"Le fichier {fichier_source_path} n'existe pas.")
        return

    with open(fichier_source_path, "r", encoding="utf-8") as file:
        data = json.load(file)
    
    # Créer les fichiers modifiés avec les nouvelles valeurs et ajout des balises <br>
    fichiers_modifies = {
        os.path.join("tabs", f"{prefixe_fichier}1.json"): {
            "Affichage11": data["Affichage11"],
            "rang11": data["ContenuCase11"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage21": data["Affichage21"],
            "rang21": data["ContenuCase21"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage31": data["Affichage31"],
            "rang31": data["ContenuCase31"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage41": data["Affichage41"],
            "rang41": data["ContenuCase41"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage51": data["Affichage51"],
            "rang51": data["ContenuCase51"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Voie": data["Voie1"]
        },
        os.path.join("tabs", f"{prefixe_fichier}2.json"): {
            "Affichage12": data["Affichage12"],
            "rang12": data["ContenuCase12"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage22": data["Affichage22"],
            "rang22": data["ContenuCase22"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage32": data["Affichage32"],
            "rang32": data["ContenuCase32"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage42": data["Affichage42"],
            "rang42": data["ContenuCase42"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage52": data["Affichage52"],
            "rang52": data["ContenuCase52"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Voie": data["Voie2"]
        },
        os.path.join("tabs", f"{prefixe_fichier}3.json"): {
            "Affichage13": data["Affichage13"],
            "rang13": data["ContenuCase13"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage23": data["Affichage23"],
            "rang23": data["ContenuCase23"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage33": data["Affichage33"],
            "rang33": data["ContenuCase33"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage43": data["Affichage43"],
            "rang43": data["ContenuCase43"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage53": data["Affichage53"],
            "rang53": data["ContenuCase53"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Voie": data["Voie3"]
        },
        os.path.join("tabs", f"{prefixe_fichier}4.json"): {
            "Affichage14": data["Affichage14"],
            "rang14": data["ContenuCase14"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage24": data["Affichage24"],
            "rang24": data["ContenuCase24"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage34": data["Affichage34"],
            "rang34": data["ContenuCase34"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage44": data["Affichage44"],
            "rang44": data["ContenuCase44"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage54": data["Affichage54"],
            "rang54": data["ContenuCase54"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Voie": data["Voie4"]
        },
        os.path.join("tabs", f"{prefixe_fichier}5.json"): {
            "Affichage15": data["Affichage15"],
            "rang15": data["ContenuCase15"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage25": data["Affichage25"],
            "rang25": data["ContenuCase25"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage35": data["Affichage35"],
            "rang35": data["ContenuCase35"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage45": data["Affichage45"],
            "rang45": data["ContenuCase45"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Affichage55": data["Affichage55"],
            "rang55": data["ContenuCase55"].replace("Effet :", "<br>Effet :").replace("Durée :", "<br>Durée :"),
            "Voie": data["Voie5"]
        }
    }

    # Enregistrer les modifications dans les fichiers existants dans "tabs"
    for fichier, contenu in fichiers_modifies.items():
        with open(fichier, "w", encoding="utf-8") as f:
            json.dump(contenu, f, ensure_ascii=False, indent=4)

    print(f"Les fichiers {prefixe_fichier}1.json à {prefixe_fichier}5.json ont été modifiés avec succès dans 'tabs/'.")

# Exemple d'utilisation :
# modifier_fichiers_existants("Rodeur.json", "Rodeur")





#  + Prestige