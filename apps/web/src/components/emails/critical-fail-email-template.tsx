import {
    Body,
    Column,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Img,
    Link,
    Preview,
    Row,
    Section,
    Text,
} from '@react-email/components';
import * as React from 'react';

interface CriticalFailEmailTemplateProps {
    firstName: string;
    rollDetails?: string;
    campaignName?: string;
}

const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : '';

export const CriticalFailEmailTemplate = ({
    firstName,
    rollDetails = '1d20 → 1',
    campaignName = 'votre campagne',
}: CriticalFailEmailTemplateProps) => (
    <Html>
        <Head />
        <Preview>💀 Échec critique ! {firstName} a fait un 1 naturel...</Preview>
        <Body style={main}>
            <Container style={container}>
                <Section style={header}>
                    <Heading style={headerTitle}>DICE DISASTER</Heading>
                </Section>

                <Section style={card}>
                    <Section style={iconSection}>
                        <Text style={skullIcon}>💀</Text>
                    </Section>

                    <Heading style={criticalHeading}>ÉCHEC CRITIQUE</Heading>

                    <Text style={introText}>
                        Le destin a parlé, <strong>{firstName}</strong>.
                    </Text>

                    <Section style={rollContainer}>
                        <Row>
                            <Column align="center">
                                <Text style={rollLabel}>RÉSULTAT DU LANCER</Text>
                                <Text style={rollValue}>1</Text>
                                <Text style={rollDetailsText}>{rollDetails}</Text>
                            </Column>
                        </Row>
                    </Section>

                    <Section style={titleContainer}>
                        <Row>
                            <Column align="center">
                                <Text style={titleLabel}>NOUVEAU TITRE DÉBLOQUÉ</Text>
                                <Text style={titleValue}>Maudit des dés</Text>
                            </Column>
                        </Row>
                    </Section>

                    <Text style={descriptionText}>
                        Une maladresse légendaire vient de se produire dans <strong>{campaignName}</strong>.
                        Que ce soit une épée qui glisse, un sort qui explose au visage ou une simple chute
                        dans l'escalier, ce moment restera gravé dans les annales.
                    </Text>

                    <Section style={quoteContainer}>
                        <Text style={quoteText}>
                            "L'échec n'est que le brouillon de la réussite... mais celui-là fait mal."
                        </Text>
                    </Section>

                    <Hr style={divider} />

                    <Text style={footerText}>
                        Courage, aventurier. La prochaine fois, les dés seront peut-être de votre côté.
                    </Text>
                </Section>

                <Text style={footerCopyright}>
                    © {new Date().getFullYear()} Yner Dice Disaster via VTT-DD. Que vos 20 soient nombreux.
                </Text>
            </Container>
        </Body>
    </Html>
);

export default CriticalFailEmailTemplate;

// Theme Colors from globals.css & tailwind.config.ts
const colors = {
    background: '#1c1c1c',     // --bg-dark
    card: '#2a2a2a',           // --bg-card
    border: '#3a3a3a',         // --border-color
    textPrimary: '#d4d4d4',    // --text-primary
    textSecondary: '#a0a0a0',  // --text-secondary
    accent: '#c0a080',         // --accent-brown
    destructive: '#ef4444',    // destructive
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

const skullIcon = {
    fontSize: '64px',
    margin: '0',
    lineHeight: '1',
};

const criticalHeading = {
    color: colors.destructive,
    fontSize: '32px',
    fontWeight: '800',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
    margin: '0 0 16px',
    // Fallback for solid color if gradient isn't supported
};

const introText = {
    fontSize: '18px',
    color: colors.textSecondary,
    margin: '0 0 32px',
    lineHeight: '26px',
};

const rollContainer = {
    backgroundColor: colors.background, // Inner container darker than card
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '32px',
    border: `1px solid ${colors.border}`,
};

const rollLabel = {
    color: colors.textSecondary,
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    margin: '0 0 8px',
};

const rollValue = {
    color: '#ffffff', // Keep white for max contrast
    fontSize: '48px',
    fontWeight: '900',
    margin: '0',
    lineHeight: '1',
    textShadow: `0 2px 10px ${colors.destructive}66`, // Red glow
};

const rollDetailsText = {
    color: colors.textSecondary,
    fontSize: '14px',
    margin: '8px 0 0',
    fontFamily: 'monospace',
};

const descriptionText = {
    color: colors.textPrimary,
    fontSize: '16px',
    lineHeight: '24px',
    marginBottom: '32px',
};

const quoteContainer = {
    borderLeft: `4px solid ${colors.accent}`,
    backgroundColor: `${colors.accent}1A`, // 10% opacity
    padding: '16px 24px',
    borderRadius: '0 8px 8px 0',
    marginBottom: '32px',
    textAlign: 'left' as const,
};

const quoteText = {
    color: colors.textPrimary,
    fontSize: '16px',
    fontStyle: 'italic',
    margin: '0',
    lineHeight: '24px',
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

const titleContainer = {
    backgroundColor: `${colors.destructive}1A`, // 10% opacity
    border: `1px solid ${colors.destructive}`,
    borderRadius: '8px',
    padding: '16px',
    marginTop: '24px',
    marginBottom: '24px',
};

const titleLabel = {
    color: colors.textSecondary,
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    margin: '0 0 4px',
};

const titleValue = {
    color: colors.destructive,
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '0',
    letterSpacing: '0.5px',
};
