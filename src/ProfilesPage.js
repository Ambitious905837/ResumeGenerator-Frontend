import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from './auth';

const emptyEducation = () => ({ degree: '', school: '', years: '' });

const emptyForm = () => ({
  name: '',
  email: '',
  phone: '',
  address: '',
  linkedin: '',
  years_of_experience: '',
  sign_off_name: '',
  education: [emptyEducation()],
  // Experience is a list of free-text lines matching the predefined format:
  // "Company (Location), Role — Start – End"
  experience: [''],
});

function ProfilesPage() {
  const [profiles, setProfiles] = useState([]); // [{ name, isCustom }]
  const [form, setForm] = useState(emptyForm());
  const [editingName, setEditingName] = useState(null); // original name when editing a custom profile
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const loadProfiles = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/profiles`);
      const names = res.data.profiles || [];
      const custom = new Set(res.data.custom || []);
      setProfiles(names.map((name) => ({ name, isCustom: custom.has(name) })));
    } catch {
      setProfiles([]);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // --- Education list handlers ---
  const setEducation = (idx, key, value) =>
    setForm((f) => ({
      ...f,
      education: f.education.map((e, i) => (i === idx ? { ...e, [key]: value } : e)),
    }));
  const addEducation = () => setForm((f) => ({ ...f, education: [...f.education, emptyEducation()] }));
  const removeEducation = (idx) =>
    setForm((f) => ({
      ...f,
      education: f.education.length > 1 ? f.education.filter((_, i) => i !== idx) : f.education,
    }));

  // --- Experience list handlers ---
  const setExperience = (idx, value) =>
    setForm((f) => ({ ...f, experience: f.experience.map((e, i) => (i === idx ? value : e)) }));
  const addExperience = () => setForm((f) => ({ ...f, experience: [...f.experience, ''] }));
  const removeExperience = (idx) =>
    setForm((f) => ({
      ...f,
      experience: f.experience.length > 1 ? f.experience.filter((_, i) => i !== idx) : f.experience,
    }));

  const resetForm = () => {
    setForm(emptyForm());
    setEditingName(null);
    setMessage({ type: '', text: '' });
  };

  const startEdit = async (name) => {
    setMessage({ type: '', text: '' });
    try {
      const res = await axios.get(`${API_BASE_URL}/api/profiles/${encodeURIComponent(name)}`);
      const p = res.data.profile || {};
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
      setEditingName(res.data.is_custom ? name : null); // built-ins: prefill only, save as new
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (!res.data.is_custom) {
        setMessage({
          type: 'info',
          text: `"${name}" is a built-in profile. You can use it as a starting point, but you must save it under a new name.`,
        });
      }
    } catch {
      setMessage({ type: 'error', text: 'Could not load that profile.' });
    }
  };

  const saveProfile = async () => {
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: 'Please enter a full name.' });
      return;
    }
    setLoading(true);
    setMessage({ type: '', text: '' });
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
      const res = await axios.post(`${API_BASE_URL}/api/profiles`, payload);
      setMessage({ type: 'success', text: res.data.message || 'Profile saved.' });
      resetForm();
      loadProfiles();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to save profile.' });
    } finally {
      setLoading(false);
    }
  };

  const deleteProfile = async (name) => {
    if (!window.confirm(`Delete profile "${name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/profiles/${encodeURIComponent(name)}`);
      setMessage({ type: 'success', text: `Deleted "${name}".` });
      if (editingName === name) resetForm();
      loadProfiles();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to delete.' });
    }
  };

  return (
    <div className="container">
      <h1 className="app-title">Manage Profiles</h1>
      <p className="app-subtitle">
        Add or edit candidate profiles here instead of editing <code>profiles.py</code>. Profiles are shared: saved
        profiles show up in the candidate dropdown on the Generate page for every user. Only admins can see this page.
      </p>

      <div className="card">
        <h2 className="section-title">{editingName ? `Edit profile: ${editingName}` : 'Add a new profile'}</h2>

        {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

        <div className="form-group">
          <label>Full name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="e.g. Jane Alexandra Doe"
            disabled={loading}
          />
        </div>

        <div className="profile-grid">
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="jane@example.com" disabled={loading} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input type="text" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="+1 (555) 123-4567" disabled={loading} />
          </div>
          <div className="form-group">
            <label>Location / Address</label>
            <input type="text" value={form.address} onChange={(e) => setField('address', e.target.value)} placeholder="City, Province/State, Country" disabled={loading} />
          </div>
          <div className="form-group">
            <label>LinkedIn</label>
            <input type="text" value={form.linkedin} onChange={(e) => setField('linkedin', e.target.value)} placeholder="linkedin.com/in/username" disabled={loading} />
          </div>
          <div className="form-group">
            <label>Years of experience</label>
            <input type="text" value={form.years_of_experience} onChange={(e) => setField('years_of_experience', e.target.value)} placeholder="e.g. 9+ years" disabled={loading} />
          </div>
          <div className="form-group">
            <label>Sign-off name (cover letter)</label>
            <input type="text" value={form.sign_off_name} onChange={(e) => setField('sign_off_name', e.target.value)} placeholder="auto: e.g. Jane D." disabled={loading} />
          </div>
        </div>

        {/* Education */}
        <h3 className="subsection-title">Education</h3>
        <div className="dynamic-list">
          {form.education.map((edu, idx) => (
            <div key={idx} className="edu-row">
              <input type="text" value={edu.degree} onChange={(e) => setEducation(idx, 'degree', e.target.value)} placeholder="Degree (e.g. B.S. in Computer Science)" disabled={loading} />
              <input type="text" value={edu.school} onChange={(e) => setEducation(idx, 'school', e.target.value)} placeholder="School" disabled={loading} />
              <input type="text" value={edu.years} onChange={(e) => setEducation(idx, 'years', e.target.value)} placeholder="Years (e.g. 2014-2018)" className="edu-years" disabled={loading} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeEducation(idx)} disabled={loading} title="Remove">✕</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addEducation} disabled={loading}>+ Add education</button>

        {/* Experience */}
        <h3 className="subsection-title" style={{ marginTop: '1.25rem' }}>Career history</h3>
        <p className="section-desc" style={{ marginBottom: 8 }}>
          One role per line, in the form <code>Company (Location), Role — Start – End</code>. For a role whose title
          should be chosen from the job description, use <code>[Determine best-fit job role from job description]</code> as the role.
        </p>
        <div className="dynamic-list">
          {form.experience.map((exp, idx) => (
            <div key={idx} className="dynamic-list-item">
              <input type="text" value={exp} onChange={(e) => setExperience(idx, e.target.value)} placeholder="Company (City, Country - Remote), Senior Software Engineer — Jan 2022 – Present" disabled={loading} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeExperience(idx)} disabled={loading} title="Remove">✕</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addExperience} disabled={loading}>+ Add role</button>

        <div className="form-group" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={saveProfile} disabled={loading}>
            {loading ? 'Saving…' : editingName ? 'Update profile' : 'Save profile'}
          </button>
          <button className="btn btn-secondary" onClick={resetForm} disabled={loading}>
            {editingName ? 'Cancel edit' : 'Clear form'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">Existing profiles</h2>
        {profiles.length === 0 ? (
          <p className="muted">No profiles found.</p>
        ) : (
          <ul className="profile-list">
            {profiles.map((p) => (
              <li key={p.name} className="profile-list-item">
                <span className="profile-list-name">
                  {p.name}
                  {p.isCustom ? <span className="badge badge-custom">custom</span> : <span className="badge badge-builtin">built-in</span>}
                </span>
                <span className="profile-list-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => startEdit(p.name)}>
                    {p.isCustom ? 'Edit' : 'Use as template'}
                  </button>
                  {p.isCustom && (
                    <button className="btn btn-danger btn-sm" onClick={() => deleteProfile(p.name)}>Delete</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ProfilesPage;
