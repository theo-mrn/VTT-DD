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

interface PremiumActivatedEmailProps {
    username?: string;
}

export const PremiumActivatedEmail = ({ username }: PremiumActivatedEmailProps) => (
    <Html>
        <Head />
        <Preview>Bienvenue dans le cercle Premium de VTT-DD !</Preview>
        <Body style={main}>
            <Container style={container}>
                <Section style={header}>
                    <Heading style={headerTitle}>STATUT PREMIUM ACTIVÉ</Heading>
                </Section>

                <Section style={card}>
                    <Section style={iconSection}>
                        <Text style={icon}>👑</Text>
                    </Section>

                    <Heading style={welcomeHeading}>MERCI {username ? username.toUpperCase() : "AVENTURIER"}</Heading>

                    <Text style={introText}>
                        Votre abonnement Premium a bien été pris en compte.
                    </Text>

                    <Text style={descriptionText}>
                        Vous avez désormais accès à l'intégralité de la collection de dés de VTT-DD, et votre badge exclusif est maintenant visible sur votre profil. Merci infiniment de soutenir le développement de l'application et de m'aider à la faire grandir !
                    </Text>

                    <Hr style={divider} />

                    <Text style={footerText}>
                        Bonne partie et que vos jets soient critiques (dans le bon sens) !
                    </Text>
                </Section>

                <Text style={footerCopyright}>
                    © {new Date().getFullYear()} Yner VTT-DD.
                </Text>
            </Container>
        </Body>
    </Html>
);

export default PremiumActivatedEmail;

// Theme Colors
const colors = {
    background: '#1c1c1c',
    card: '#2a2a2a',
    border: '#3a3a3a',
    textPrimary: '#d4d4d4',
    textSecondary: '#a0a0a0',
    accent: '#ce9c56',
    success: '#10b981',
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
    color: colors.accent,
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
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
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
