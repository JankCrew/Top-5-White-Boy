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

The app now includes `config.js`, which points the browser app at the Supabase project. Friends should not need to enter the Supabase URL or publishable key themselves.

The database schema has already been created if you ran `supabase-schema.sql` in the Supabase SQL editor.

For the easiest first test, keep email confirmations off in Supabase Auth. If confirmations are on, new users need to confirm their email before signing in.

## Running locally

This first version is static. Open `index.html` directly in a browser, or host the folder with any static file server.

## Test accounts

Create temporary accounts from the app signup screen, or from Supabase under Authentication -> Users. Avoid writing directly into Supabase's internal auth tables.

## Good next features

- Upload profile pictures to Supabase Storage
- Multiple groups per user with a group switcher
- Ranking categories
- Anonymous ranking mode
- Admin controls for removing members or rotating invite codes
