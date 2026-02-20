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

interface SignUpEmailTemplateProps {
    username: string;
}

export const SignUpEmailTemplate = ({
    username,
}: SignUpEmailTemplateProps) => (
    <Html>
        <Head />
        <Preview>Bienvenue sur VTT-DD, {username} !</Preview>
        <Body style={main}>
            <Container style={container}>
                <Section style={header}>
                    <Heading style={headerTitle}>BIENVENUE {username}</Heading>
                </Section>

                <Section style={card}>
                    <Section style={iconSection}>
                        <Text style={icon}>⚔️</Text>
                    </Section>

                    <Heading style={welcomeHeading}>LA QUÊTE COMMENCE</Heading>

                    <Text style={introText}>
                        Salutations, <strong>{username}</strong>.
                    </Text>

                    <Text style={descriptionText}>
                        Votre inscription sur VTT-DD a été validée avec succès. Vous êtes maintenant prêt(e) à lancer les dés, explorer de nouveaux mondes et braver tous les dangers avec la communauté.
                    </Text>

                    <Hr style={divider} />

                    <Text style={footerText}>
                        Préparez votre feuille de personnage, l'aventure vous attend !
                    </Text>
                </Section>

                <Text style={footerCopyright}>
                    © {new Date().getFullYear()} Yner VTT-DD. Que vos 20 soient nombreux.
                </Text>
            </Container>
        </Body>
    </Html>
);

export default SignUpEmailTemplate;

// Theme Colors
const colors = {
    background: '#1c1c1c',
    card: '#2a2a2a',
    border: '#3a3a3a',
    textPrimary: '#d4d4d4',
    textSecondary: '#a0a0a0',
    accent: '#c0a080',
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
    fontSize: '32px',
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
