import { createClient } from '@supabase/supabase-js';

type AccountRole = 'admin' | 'manager' | 'official';

interface AccountRow {
  employee_id: string;
  username: string;
  password_hash: string;
  access_role: AccountRole;
  display_name: string | null;
  profile_picture: string | null;
  is_active: boolean;
}

const PROFILE_PICTURE_BUCKET = process.env.SUPABASE_PROFILE_PICTURE_BUCKET || 'profile-pictures';
const ALLOWED_PROFILE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).');
  return createClient(url, key);
}

async function findAccount(supabase: ReturnType<typeof getSupabase>, identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  const byUsername = await supabase
    .from('accounts')
    .select('employee_id, username, password_hash, access_role, display_name, profile_picture, is_active')
    .eq('username', normalized)
    .maybeSingle();
  if (byUsername.error) throw new Error(byUsername.error.message);
  if (byUsername.data) return byUsername.data as AccountRow;

  const byEmp = await supabase
    .from('accounts')
    .select('employee_id, username, password_hash, access_role, display_name, profile_picture, is_active')
    .eq('employee_id', identifier.trim())
    .maybeSingle();
  if (byEmp.error) throw new Error(byEmp.error.message);
  return (byEmp.data as AccountRow | null) ?? null;
}

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'GET').toUpperCase();
    const supabase = getSupabase();

    if (method === 'DELETE') {
      const identifier = String(req.body?.identifier ?? req.body?.username ?? req.query?.identifier ?? '').trim();
      if (!identifier) return res.status(400).json({ message: 'Account identifier is required.' });
      const account = await findAccount(supabase, identifier);
      if (!account || !account.is_active) return res.status(401).json({ message: 'Account not found or inactive.' });
      const { error } = await supabase
        .from('accounts')
        .update({ profile_picture: null, updated_at: new Date().toISOString() })
        .eq('employee_id', account.employee_id);
      if (error) return res.status(500).json({ message: 'Failed to remove profile picture.', detail: error.message });
      return res.status(200).json({ message: 'Profile picture removed.', profilePicture: null });
    }

    if (method !== 'POST') {
      res.setHeader('Allow', 'POST, DELETE');
      return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const identifier = String(req.body?.identifier ?? req.body?.username ?? '').trim();
    const imageBase64 = String(req.body?.imageBase64 ?? '').trim();
    const mimeType = String(req.body?.mimeType ?? 'image/jpeg').trim().toLowerCase();

    if (!identifier) return res.status(400).json({ message: 'Account identifier is required.' });
    if (!imageBase64) {
      return res.status(400).json({
        message: 'imageBase64 is required (or use the Express multipart endpoint).',
      });
    }
    if (!ALLOWED_PROFILE_MIME.has(mimeType)) {
      return res.status(400).json({ message: 'Only JPG, PNG, and WEBP images are allowed.' });
    }

    const account = await findAccount(supabase, identifier);
    if (!account || !account.is_active) return res.status(401).json({ message: 'Account not found or inactive.' });

    const raw = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const buffer = Buffer.from(raw, 'base64');
    if (!buffer.length) return res.status(400).json({ message: 'Invalid image data.' });
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ message: 'Image must be 5MB or smaller.' });
    }

    const ext =
      mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
    const storagePath = `${account.employee_id}/${Date.now()}${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(PROFILE_PICTURE_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: true });
    if (uploadError) {
      return res.status(500).json({
        message: 'Failed to upload profile picture. Ensure the profile-pictures bucket exists.',
        detail: uploadError.message,
      });
    }

    const { data: publicData } = supabase.storage.from(PROFILE_PICTURE_BUCKET).getPublicUrl(storagePath);
    const profilePictureUrl = publicData.publicUrl;
    const { error: updateError } = await supabase
      .from('accounts')
      .update({ profile_picture: profilePictureUrl, updated_at: new Date().toISOString() })
      .eq('employee_id', account.employee_id);
    if (updateError) {
      return res.status(500).json({ message: 'Failed to save profile picture URL.', detail: updateError.message });
    }

    return res.status(200).json({ message: 'Profile picture updated.', profilePicture: profilePictureUrl });
  } catch (error: any) {
    return res.status(500).json({
      message: 'Internal server error.',
      detail: error?.message ?? String(error),
    });
  }
}
