import {
    Body,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Preview,
    Section,
    Text,
} from '@react-email/components';
import * as React from 'react';

interface PremiumCancelledEmailProps {
    username?: string;
    cancelAtDate?: string;
}

export const PremiumCancelledEmail = ({ username, cancelAtDate }: PremiumCancelledEmailProps) => (
    <Html>
        <Head />
        <Preview>Confirmation d'annulation de votre abonnement VTT-DD.</Preview>
        <Body style={main}>
            <Container style={container}>
                <Section style={header}>
                    <Heading style={headerTitle}>RÉSILIATION DE L'ABONNEMENT</Heading>
                </Section>

                <Section style={card}>
                    <Section style={iconSection}>
                        <Text style={icon}>📉</Text>
                    </Section>

                    <Heading style={welcomeHeading}>Au revoir {username ? username : "Aventurier"} !</Heading>

                    <Text style={introText}>
                        Votre demande de résiliation a bien été prise en compte.
                    </Text>

                    <Text style={descriptionText}>
                        C'est dommage de vous voir partir, mais votre décision est actée.
                        Vous conserverez vos avantages Premium et l'accès à tous les dés exclusifs jusqu'au <strong>{cancelAtDate || "la fin de la période en cours"}</strong>. Après cette date, votre compte repassera automatiquement en statut gratuit et vous ne serez plus prélevé.
                    </Text>

                    <Hr style={divider} />

                    <Text style={footerText}>
                        Si vous changez d'avis, vous pourrez toujours vous réabonner à tout moment depuis votre profil !
                    </Text>
                </Section>

                <Text style={footerCopyright}>
                    © {new Date().getFullYear()} Yner VTT-DD.
                </Text>
            </Container>
        </Body>
    </Html>
);

export default PremiumCancelledEmail;

// Theme Colors
const colors = {
    background: '#1c1c1c',
    card: '#2a2a2a',
    border: '#3a3a3a',
    textPrimary: '#d4d4d4',
    textSecondary: '#a0a0a0',
    accent: '#ef4444',
    success: '#ce9c56',
};

const main = {
    backgroundColor: colors.background,
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
    color: colors.textPrimary,
};

const container = {
    margin: '0 auto',
    padding: '40px 20px',
    maxWidth: '580px',
};

const header = {
    marginBottom: '32px',
    textAlign: 'center' as const,
};

const headerTitle = {
    color: colors.textSecondary,
    fontSize: '24px',
    fontWeight: '800',
    letterSpacing: '4px',
    margin: '0',
    textTransform: 'uppercase' as const,
};

const card = {
    backgroundColor: colors.card,
    borderRadius: '16px',
    border: `1px solid ${colors.border}`,
    padding: '40px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
    textAlign: 'center' as const,
};

const iconSection = {
    marginBottom: '24px',
};

const icon = {
    fontSize: '64px',
    margin: '0',
    lineHeight: '1',
};

const welcomeHeading = {
    color: colors.success,
    fontSize: '28px',
    fontWeight: '800',
    textTransform: 'none' as const,
    letterSpacing: '0',
    margin: '0 0 16px',
};

const introText = {
    fontSize: '18px',
    color: colors.textSecondary,
    margin: '0 0 32px',
    lineHeight: '26px',
};

const descriptionText = {
    color: colors.textPrimary,
    fontSize: '16px',
    lineHeight: '24px',
    marginBottom: '32px',
};

const divider = {
    borderColor: colors.border,
    margin: '32px 0',
};

const footerText = {
    color: colors.textSecondary,
    fontSize: '14px',
    margin: '0',
};

const footerCopyright = {
    color: '#525252',
    fontSize: '12px',
    textAlign: 'center' as const,
    marginTop: '32px',
};
