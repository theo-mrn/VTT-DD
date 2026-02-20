import React from 'react';

export default function MentionsLegales() {
    return (
        <div className="container mx-auto py-12 px-4 max-w-4xl text-foreground">
            <h1 className="text-3xl font-bold mb-8">Mentions Légales</h1>

            <div className="space-y-8">
                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">2. Hébergement</h2>
                    <p className="mb-2">
                        L'application est hébergée par :
                    </p>
                    <ul className="list-disc pl-6 space-y-1">
                        <li><strong>Hébergeur :</strong> Vercel Inc.</li>
                        <li><strong>Adresse :</strong> 340 S Lemon Ave #4133 Walnut, CA 91789, USA</li>
                        <li><strong>Site web :</strong> https://vercel.com</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">3. Propriété intellectuelle</h2>
                    <p>
                        L'ensemble des éléments figurant sur cette application (textes, images, logos, etc.)
                        sont protégés par les dispositions du Code de la Propriété Intellectuelle.
                        Toute reproduction, représentation, modification, publication, adaptation de
                        tout ou partie des éléments de l'application, quel que soit le moyen ou
                        le procédé utilisé, est interdite, sauf autorisation écrite préalable.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">4. Données personnelles</h2>
                    <p>
                        VTT-DD s'engage à ce que la collecte et le traitement de vos données,
                        effectués à partir de l'application, soient conformes au règlement
                        général sur la protection des données (RGPD) et à la loi Informatique et Libertés.
                        Pour toute demande relative à vos données personnelles, veuillez nous contacter
                        à l'adresse email indiquée ci-dessus.
                    </p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold mb-4 text-primary">5. Cookies</h2>
                    <p>
                        L'application peut être amenée à vous demander l'acceptation des cookies
                        pour des besoins de statistiques et d'affichage. Un cookie est une information
                        déposée sur votre disque dur par le serveur du site que vous visitez.
                    </p>
                </section>
            </div>
        </div>
    );
}
