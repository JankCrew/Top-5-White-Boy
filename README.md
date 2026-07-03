# Rank Circle

A mobile-first friend group ranking app backed by Supabase.

## Included in this first version

- Email/password accounts through Supabase Auth
- Profile customization with nickname and profile picture URL
- Group creation with invite codes
- Joining groups by invite code
- Personal rankings for everyone in the group
- Overall rankings calculated from average ranking position
- Mobile-first layout that also works on desktop

## Supabase setup

1. Create a Supabase project.
2. Open the SQL editor in Supabase.
3. Run the contents of `supabase-schema.sql`.
4. In Supabase, go to Project Settings, then API.
5. Copy the project URL and public anon key.
6. Open `index.html` and paste those values into the setup screen.

For the easiest first test, turn off email confirmations in Supabase Auth. If confirmations are on, new users need to confirm their email before signing in.

## Running locally

This first version is static. Open `index.html` directly in a browser, or host the folder with any static file server.

## Good next features

- Upload profile pictures to Supabase Storage
- Multiple groups per user with a group switcher
- Ranking categories
- Anonymous ranking mode
- Admin controls for removing members or rotating invite codes
