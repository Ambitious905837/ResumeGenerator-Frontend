import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  BookOpen,
  Briefcase,
  Copy,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRoundPlus,
  Users,
  X,
} from 'lucide-react';
import { API_BASE_URL } from '../auth';
import { errorDetail } from '../lib/download';
import { notify } from '../lib/notify';
import type { CandidateProfile, Education, ProfileSummary } from '../types/api';
import { PageHeader } from '../components/AppShell';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader, SectionHeading } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { Field, Input } from '../components/ui/field';
import { EmptyState } from '../components/ui/feedback';

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  linkedin: string;
  years_of_experience: string;
  sign_off_name: string;
  education: Education[];
  // Experience is a list of free-text lines matching the predefined format:
  // "Company (Location), Role — Start – End"
  experience: string[];
}

const emptyEducation = (): Education => ({ degree: '', school: '', years: '' });

const emptyForm = (): ProfileForm => ({
  name: '',
  email: '',
  phone: '',
  address: '',
  linkedin: '',
  years_of_experience: '',
  sign_off_name: '',
  education: [emptyEducation()],
  experience: [''],
});

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  /** The original name, when editing a custom profile. Null means "saving a new one". */
  const [editingName, setEditingName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProfiles = useCallback(async () => {
    try {
      const res = await axios.get<{ profiles?: string[]; custom?: string[] }>(
        `${API_BASE_URL}/api/profiles`
      );
      const names = res.data.profiles || [];
      const custom = new Set(res.data.custom || []);
      setProfiles(names.map((name) => ({ name, isCustom: custom.has(name) })));
    } catch {
      setProfiles([]);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const setField = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // --- Education list handlers ---
  const setEducation = (index: number, key: keyof Education, value: string) =>
    setForm((f) => ({
      ...f,
      education: f.education.map((e, i) => (i === index ? { ...e, [key]: value } : e)),
    }));
  const addEducation = () => setForm((f) => ({ ...f, education: [...f.education, emptyEducation()] }));
  const removeEducation = (index: number) =>
    setForm((f) => ({
      ...f,
      education: f.education.length > 1 ? f.education.filter((_, i) => i !== index) : f.education,
    }));

  // --- Experience list handlers ---
  const setExperience = (index: number, value: string) =>
    setForm((f) => ({ ...f, experience: f.experience.map((e, i) => (i === index ? value : e)) }));
  const addExperience = () => setForm((f) => ({ ...f, experience: [...f.experience, ''] }));
  const removeExperience = (index: number) =>
    setForm((f) => ({
      ...f,
      experience: f.experience.length > 1 ? f.experience.filter((_, i) => i !== index) : f.experience,
    }));

  const resetForm = () => {
    setForm(emptyForm());
    setEditingName(null);
    setNotice(null);
  };

  const startEdit = async (name: string) => {
    setNotice(null);
    try {
      const res = await axios.get<{ profile?: CandidateProfile; is_custom?: boolean }>(
        `${API_BASE_URL}/api/profiles/${encodeURIComponent(name)}`
      );
      const p = res.data.profile || ({} as CandidateProfile);
      setForm({
        name: p.name || '',
        email: p.email || '',
        phone: p.phone || '',
        address: p.address || '',
        linkedin: p.linkedin || '',
        years_of_experience: '',
        sign_off_name: p.sign_off_name || '',
        education: (p.education && p.education.length ? p.education : [emptyEducation()]).map((e) => ({
          degree: e.degree || '',
          school: e.school || '',
          years: e.years || '',
        })),
        experience: p.experience && p.experience.length ? p.experience : [''],
      });
      // Built-ins: prefill only, save as new.
      setEditingName(res.data.is_custom ? name : null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (!res.data.is_custom) {
        setNotice({
          tone: 'info',
          text: `"${name}" is a built-in profile. You can use it as a starting point, but you must save it under a new name.`,
        });
      }
    } catch {
      notify.error('Could not load that profile.');
    }
  };

  const saveProfile = async () => {
    if (!form.name.trim()) {
      setNotice({ tone: 'error', text: 'Please enter a full name.' });
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        linkedin: form.linkedin.trim(),
        years_of_experience: form.years_of_experience.trim(),
        sign_off_name: form.sign_off_name.trim(),
        education: form.education
          .filter((e) => e.degree.trim() || e.school.trim())
          .map((e) => ({ degree: e.degree.trim(), school: e.school.trim(), years: e.years.trim() })),
        experience: form.experience.map((e) => e.trim()).filter(Boolean),
      };
      const res = await axios.post<{ message?: string }>(`${API_BASE_URL}/api/profiles`, payload);
      notify.success(res.data.message || 'Profile saved.');
      resetForm();
      loadProfiles();
    } catch (err) {
      setNotice({ tone: 'error', text: errorDetail(err, 'Failed to save profile.') });
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_BASE_URL}/api/profiles/${encodeURIComponent(pendingDelete)}`);
      notify.success(`Deleted "${pendingDelete}".`);
      if (editingName === pendingDelete) resetForm();
      loadProfiles();
      setPendingDelete(null);
    } catch (err) {
      notify.error(errorDetail(err, 'Failed to delete.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidate profiles"
        description="Profiles are shared: anything saved here shows up in the candidate picker on the Generate page for every user assigned to it. Only admins can see this page."
      />

      <Card>
        <CardHeader
          icon={editingName ? Pencil : UserRoundPlus}
          title={editingName ? `Editing “${editingName}”` : 'Add a new profile'}
          description={
            editingName
              ? 'Saving updates the existing profile. Everyone assigned to it will generate with the new details from their next run.'
              : 'The name is the only required field — everything else fills in the resume header and cover letter sign-off.'
          }
          actions={
            editingName ? (
              <Button variant="ghost" size="sm" icon={X} onClick={resetForm} disabled={loading}>
                Cancel edit
              </Button>
            ) : null
          }
        />

        <CardBody className="space-y-6">
          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Full name" htmlFor="profile-name" required className="sm:col-span-2 lg:col-span-1">
              <Input
                id="profile-name"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="e.g. Jane Alexandra Doe"
                disabled={loading}
              />
            </Field>
            <Field label="Email" htmlFor="profile-email">
              <Input
                id="profile-email"
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="jane@example.com"
                disabled={loading}
              />
            </Field>
            <Field label="Phone" htmlFor="profile-phone">
              <Input
                id="profile-phone"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
                disabled={loading}
              />
            </Field>
            <Field label="Location" htmlFor="profile-address">
              <Input
                id="profile-address"
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
                placeholder="City, Province/State, Country"
                disabled={loading}
              />
            </Field>
            <Field label="LinkedIn" htmlFor="profile-linkedin">
              <Input
                id="profile-linkedin"
                value={form.linkedin}
                onChange={(e) => setField('linkedin', e.target.value)}
                placeholder="linkedin.com/in/username"
                disabled={loading}
              />
            </Field>
            <Field label="Years of experience" htmlFor="profile-years">
              <Input
                id="profile-years"
                value={form.years_of_experience}
                onChange={(e) => setField('years_of_experience', e.target.value)}
                placeholder="e.g. 9+ years"
                disabled={loading}
              />
            </Field>
            <Field
              label="Sign-off name"
              htmlFor="profile-signoff"
              hint="Used at the end of the cover letter. Left blank, it is derived from the full name."
            >
              <Input
                id="profile-signoff"
                value={form.sign_off_name}
                onChange={(e) => setField('sign_off_name', e.target.value)}
                placeholder="auto: e.g. Jane D."
                disabled={loading}
              />
            </Field>
          </div>

          {/* --- Education --- */}
          <div>
            <SectionHeading>
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Education
              </span>
            </SectionHeading>
            <div className="space-y-2">
              {form.education.map((edu, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-[14rem] flex-[2]"
                    value={edu.degree}
                    onChange={(e) => setEducation(index, 'degree', e.target.value)}
                    placeholder="Degree (e.g. B.S. in Computer Science)"
                    disabled={loading}
                    aria-label={`Degree ${index + 1}`}
                  />
                  <Input
                    className="min-w-[12rem] flex-[2]"
                    value={edu.school}
                    onChange={(e) => setEducation(index, 'school', e.target.value)}
                    placeholder="School"
                    disabled={loading}
                    aria-label={`School ${index + 1}`}
                  />
                  <Input
                    className="w-32"
                    value={edu.years}
                    onChange={(e) => setEducation(index, 'years', e.target.value)}
                    placeholder="2014–2018"
                    disabled={loading}
                    aria-label={`Years ${index + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEducation(index)}
                    disabled={loading || form.education.length <= 1}
                    aria-label={`Remove education ${index + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              className="mt-2"
              onClick={addEducation}
              disabled={loading}
            >
              Add education
            </Button>
          </div>

          {/* --- Career history --- */}
          <div>
            <SectionHeading
              hint={
                <>
                  One role per line, as{' '}
                  <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-fg">
                    Company (Location), Role — Start – End
                  </code>
                  . For a role whose title should be chosen from the job description, use{' '}
                  <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-fg">
                    [Determine best-fit job role from job description]
                  </code>{' '}
                  as the role.
                </>
              }
            >
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                Career history
              </span>
            </SectionHeading>
            <div className="space-y-2">
              {form.experience.map((exp, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={exp}
                    onChange={(e) => setExperience(index, e.target.value)}
                    placeholder="Acme (Toronto, Canada – Remote), Senior Software Engineer — Jan 2022 – Present"
                    disabled={loading}
                    aria-label={`Role ${index + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeExperience(index)}
                    disabled={loading || form.experience.length <= 1}
                    aria-label={`Remove role ${index + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              className="mt-2"
              onClick={addExperience}
              disabled={loading}
            >
              Add role
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-5">
            <Button variant="primary" icon={Save} onClick={saveProfile} loading={loading}>
              {editingName ? 'Update profile' : 'Save profile'}
            </Button>
            <Button variant="secondary" onClick={resetForm} disabled={loading}>
              {editingName ? 'Cancel edit' : 'Clear form'}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={Users}
          title="Existing profiles"
          description="Built-in profiles ship with the app and cannot be changed in place — open one as a template and save it under a new name."
          actions={<Badge tone="neutral">{profiles.length} total</Badge>}
        />
        <CardBody>
          {profiles.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No profiles yet"
              description="Fill in the form above to create the first candidate profile."
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {profiles.map((profile) => (
                <li
                  key={profile.name}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 transition-colors hover:border-border-strong"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                    {profile.name}
                  </span>
                  <Badge tone={profile.isCustom ? 'brand' : 'neutral'}>
                    {profile.isCustom ? 'custom' : 'built-in'}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={profile.isCustom ? Pencil : Copy}
                    onClick={() => startEdit(profile.name)}
                  >
                    {profile.isCustom ? 'Edit' : 'Template'}
                  </Button>
                  {profile.isCustom && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPendingDelete(profile.name)}
                      aria-label={`Delete ${profile.name}`}
                      className="text-danger hover:bg-danger-soft hover:text-danger-fg"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete “${pendingDelete}”?`}
        description="This cannot be undone. Resumes already generated with this profile are unaffected, but nobody will be able to generate with it again."
        confirmLabel="Delete profile"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
