1. User will be created in Clerk dashboard in their website.
2. The system will send an invite link via email to the user. Then will automatically assign the invited user to the same specific org and with the assigned role. A record under user invitation table will be added with a pending status. (check this for reference: C:\Users\nikol\Desktop\dev\cuddlycareanimalclinic\prisma) 
3. Once the user accepts the invitation, they will be redirected to the login page. The status of the user in the user invitation table will be updated to "accepted".
4. Once they login their account, this is where the handshake will happen. The system will authenticate if the account logged in is correct then a record in the user table will be created.
5. After that, user account is successfully created.
