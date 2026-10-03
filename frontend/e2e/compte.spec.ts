/**
 * Compte : inscription par le formulaire (puis l'accueil des nouveaux, qu'on passe), connexion,
 * déconnexion, et mot de passe erroné.
 */
import { expect, test } from '@playwright/test';
import { creerCompte, identite } from './support/api';

test('inscription : le compte est créé, l’accueil des nouveaux s’ouvre, puis l’accueil', async ({
  page,
}) => {
  const i = identite('Inscrit');
  await page.goto('/connexion');
  await page.getByRole('tab', { name: 'Inscription' }).click();
  await page.getByLabel('Nom d’aventurier').or(page.getByLabel("Nom d'aventurier")).fill(i.nom);
  await page.getByLabel('E-mail').fill(i.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(i.motDePasse);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/bienvenue/);
  await page.getByRole('button', { name: 'Passer' }).click();
  await expect(page).toHaveURL(/\/accueil/);
});

test('connexion puis déconnexion', async ({ page, browser }) => {
  // Compte préparé dans un autre navigateur : celui-ci n'a aucune session
  const autre = await browser.newPage();
  const compte = await creerCompte(autre, 'Habitue');
  await autre.close();

  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(compte.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(compte.motDePasse);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/accueil/);

  await page.getByRole('button', { name: new RegExp(compte.nom) }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await expect(page).not.toHaveURL(/\/accueil/);
  // Plus de session : une page protégée renvoie vers la connexion
  await page.goto('/campagnes');
  await expect(page).toHaveURL(/\/connexion/);
});

test('mot de passe erroné : message, on reste sur la connexion', async ({ page, browser }) => {
  const autre = await browser.newPage();
  const compte = await creerCompte(autre, 'Distrait');
  await autre.close();

  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(compte.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('pas-le-bon-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('E-mail ou mot de passe incorrect')).toBeVisible();
  await expect(page).toHaveURL(/\/connexion/);
});
