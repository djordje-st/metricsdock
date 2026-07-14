import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'jsx-email'

const main = {
  backgroundColor: '#fcfdff',
  color: '#0d1014',
  fontFamily:
    'Geist Variable, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  margin: 0,
  padding: '32px 0',
}

const container = {
  backgroundColor: '#ffffff',
  border: '1px solid #e0e3e7',
  borderRadius: '9px',
  padding: '32px',
}

const brand = {
  color: '#0d1014',
  fontSize: '14px',
  fontWeight: 700,
  lineHeight: '20px',
  margin: '10px 0 0',
  textAlign: 'center' as const,
}

const logo = {
  display: 'block',
  margin: '0 auto',
}

const heading = {
  color: '#0d1014',
  fontSize: '24px',
  lineHeight: '32px',
  margin: '24px 0 12px',
}

const text = {
  color: '#0d1014',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 16px',
}

const mutedText = {
  color: '#646d78',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '16px 0 0',
}

const link = {
  color: '#0069c6',
  textDecoration: 'underline',
}

type OrganizationInvitationEmailProps = {
  invitationUrl: string
  inviterName?: string | null
  organizationName: string
  role?: string | null
}

export const previewProps = {
  invitationUrl:
    'https://metricsdock.com/accept-invitation?invitationId=preview',
  inviterName: 'Taylor',
  organizationName: 'Acme Analytics',
  role: 'admin',
} satisfies OrganizationInvitationEmailProps

export function Template(props: Partial<OrganizationInvitationEmailProps>) {
  return <OrganizationInvitationEmail {...previewProps} {...props} />
}

export function OrganizationInvitationEmail({
  invitationUrl,
  inviterName,
  organizationName,
  role,
}: OrganizationInvitationEmailProps) {
  const trimmedInviterName = inviterName?.trim()
  const inviterDisplayName = trimmedInviterName || 'A teammate'
  const logoUrl = new URL('/logo.png', invitationUrl).href
  const roleDisplay = formatRole(role)

  return (
    <Html>
      <Head />
      <Preview>
        {inviterDisplayName} invited you to join {organizationName}
      </Preview>
      <Body style={main}>
        <Container containerWidth={560} style={container}>
          <Section>
            <Img
              alt="MetricsDock"
              height="42"
              src={logoUrl}
              style={logo}
              width="36"
            />
            <Text style={brand}>MetricsDock</Text>
          </Section>
          <Heading as="h1" style={heading}>
            Join {organizationName}
          </Heading>
          <Text style={text}>
            {inviterDisplayName} invited you to join {organizationName} on
            MetricsDock.
          </Text>
          {roleDisplay ? (
            <Text style={text}>You were invited as {roleDisplay}.</Text>
          ) : null}
          <Button
            align="center"
            backgroundColor="#0069c6"
            borderRadius={9}
            fontSize={15}
            height={44}
            href={invitationUrl}
            textColor="#f4fbff"
            width={190}
          >
            Accept invitation
          </Button>
          <Text style={mutedText}>
            This invitation expires in 7 days. If you were not expecting this
            invitation, you can ignore this email.
          </Text>
          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />
          <Text style={mutedText}>
            Button not working? Open this link:{' '}
            <a href={invitationUrl} style={link}>
              {invitationUrl}
            </a>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

function formatRole(role: string | null | undefined) {
  const roles = role
    ?.split(',')
    .map((value) => value.trim().replace(/[-_]+/g, ' '))
    .filter(Boolean)

  if (!roles?.length) return null

  return roles.join(', ')
}
