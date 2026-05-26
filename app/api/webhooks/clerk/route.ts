import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'

// Import directly from your custom generated output path
import { PrismaClient, SystemRole, InvitationStatus } from '../../../generated/prisma'

const prisma = new PrismaClient()

export async function POST(req: Request) {
  // You can find this in the Clerk Dashboard -> Webhooks -> choose the webhook
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local')
  }

  // Get the headers
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    })
  }

  // Get the body
  const payload = await req.json()
  const body = JSON.stringify(payload)

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook:', err)
    return new Response('Error occured', {
      status: 400,
    })
  }

  const eventType = evt.type

  // 1. Handshake: Create user in database when they sign up
  // Helper to map Clerk roles to your Prisma SystemRole enum
  const mapClerkRoleToPrisma = (clerkRole: string): SystemRole => {
    switch (clerkRole) {
      case 'org:admin': return SystemRole.ORG_ADMIN;
      case 'org:veterinarian': return SystemRole.VETERINARIAN;
      case 'org:customer': return SystemRole.CUSTOMER;
      case 'org:owner': return SystemRole.OWNER;
      case 'org:super_admin': return SystemRole.SUPER_ADMIN;
      default: return SystemRole.MEMBER;
    }
  };

  // 1. Sync Organizations to satisfy foreign keys
  if (eventType === 'organization.created') {
    const { id, name } = evt.data
    
    console.log(`Organization created: ${id}`)
    await prisma.organization.create({
      data: { id, name }
    })
  }

  // 2. Handshake: Create user in database when they sign up
  if (eventType === 'user.created') {
    const { id, email_addresses } = evt.data
    
    console.log(`User created in Clerk: ${id}`)
    await prisma.user.create({ 
      data: { 
        id: id, 
        email: email_addresses[0].email_address 
      } 
    })
  }

  // 3. Track pending invitations
  if (eventType === 'organizationInvitation.created') {
    const { id, email_address, role, organization_id, public_metadata } = evt.data
    
    console.log(`Invite sent to: ${email_address}`)
    
    await prisma.userInvitation.create({ 
      data: { 
        id: id, 
        email: email_address,
        // Clerk handles the physical tokens internally. To satisfy your schema's @unique, we use the Clerk ID
        token: id, 
        role: mapClerkRoleToPrisma(role),
        status: InvitationStatus.PENDING,
        organizationId: organization_id,
        // Note: The FALLBACK_ADMIN_ID must exist in your User table or this will fail the relation constraint
        invitedByUserId: (public_metadata?.inviterUserId as string) || 'FALLBACK_ADMIN_ID', 
        // Clerk handles expiration, we apply a default 30-day placeholder
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
      } 
    })
  }

  // 4. Mark invitations as accepted
  if (eventType === 'organizationInvitation.accepted') {
    const { id } = evt.data

    console.log(`Invite accepted: ${id}`)
    await prisma.userInvitation.update({ 
      where: { id: id }, 
      data: { status: InvitationStatus.ACCEPTED } 
    })
  }

  // 5. Update the User with their Role and Organization when they join
  if (eventType === 'organizationMembership.created') {
    const { public_user_data, organization, role } = evt.data
    const userId = public_user_data?.user_id

    console.log(`User ${userId} joined organization ${organization.id}`)
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { 
          organizationId: organization.id, 
          role: mapClerkRoleToPrisma(role) 
        }
      })
    }
  }

  return new Response('', { status: 200 })
}
