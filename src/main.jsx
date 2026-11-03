import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Play, Plus, Users, MessageCircle, Link2, Search, Bell, Settings, Send, Copy, Check, X, ChevronRight, Menu, Clapperboard, DoorOpen, Film, LoaderCircle, Pencil, Sun, Moon, ListPlus, PictureInPicture2, Volume2, ShieldCheck } from 'lucide-react';
import './style.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [rooms, setRooms] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [tab, setTab] = useState('Phòng của tôi');
  const [query, setQuery] = useState('');
  const [roomName, setRoomName] = useState('Movie night của tụi mình');
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState('');
  const [youtubeInput, setYoutubeInput] = useState('');
  const [videoBusy, setVideoBusy] = useState(false);
  const [modal, setModal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [nav, setNav] = useState(false);
  const [playlistInput, setPlaylistInput] = useState('');
  const [miniPlayer, setMiniPlayer] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState(null);
  const [memberControl, setMemberControl] = useState({});
  const [volume, setVolume] = useState(() => Number(localStorage.getItem('watchparty_volume') || 75));
  const playerRef = useRef(null);
  const playerReadyRef = useRef(false);
  const syncGuardRef = useRef(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('watchparty_theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('watchparty_theme', theme);
  }, [theme]);

  const user = session?.user;
  const activeRoom = rooms.find((room) => room.id === activeId) || null;
  const playlist = Array.isArray(activeRoom?.playlist) ? activeRoom.playlist : (activeRoom?.video_id ? [{ id: activeRoom.video_id, url: activeRoom.video_url }] : []);
  const canControl = !!activeRoom && (activeRoom.host_id === user?.id || members.some((m) => m.user_id === user?.id && m.can_control));
  const filteredRooms = useMemo(() => rooms.filter((room) => {
    const text = (room.name + ' ' + room.invite_code).toLowerCase();
    return text.includes(query.toLowerCase());
  }), [rooms, query]);

  const loadRooms = useCallback(async () => {
    if (!user || !supabase) return;
    const { data, error: loadError } = await supabase.from('rooms').select('*').neq('status', 'ended').order('created_at', { ascending: false });
    if (loadError) { setError(loadError.message); return; }
    setRooms(data || []);
    setActiveId((current) => current && data?.some((room) => room.id === current) ? current : data?.[0]?.id || null);
  }, [user]);

  const loadRoomDetails = useCallback(async (roomId) => {
    if (!roomId || !supabase) { setMembers([]); setMessages([]); return; }
    const [{ data: memberRows, error: memberError }, { data: messageRows, error: messageError }] = await Promise.all([
      supabase.from('room_members').select('user_id, role, joined_at').eq('room_id', roomId).order('joined_at'),
      supabase.from('messages').select('id, user_id, body, created_at').eq('room_id', roomId).order('created_at').limit(100)
    ]);
    if (memberError) setError(memberError.message);
    if (messageError) setError(messageError.message);
    const ids = [...new Set([...(memberRows || []).map((row) => row.user_id), ...(messageRows || []).map((row) => row.user_id)])];
    let profiles = [];
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id, display_name').in('id', ids);
      profiles = data || [];
    }
    const names = Object.fromEntries(profiles.map((item) => [item.id, item.display_name]));
    setMembers((memberRows || []).map((row) => ({ ...row, display_name: names[row.user_id] || 'Thành viên' })));
    setMessages((messageRows || []).map((row) => ({ ...row, display_name: names[row.user_id] || 'Thành viên' })));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) setSession(nextSession);
    });
    (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (data.session) {
        if (alive) setSession(data.session);
      } else {
        const rememberedName = localStorage.getItem('watchparty_guest_name') || 'Khách';
        const { data: guest, error: guestError } = await supabase.auth.signInAnonymously({
          options: { data: { display_name: rememberedName } }
        });
        if (guestError) throw guestError;
        if (alive) setSession(guest.session);
      }
    })().catch((e) => setError(e.message || 'Không thể tạo danh tính khách. Hãy bật Anonymous Sign-Ins trong Supabase Auth.'));
    setIdentityReady(true);
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user || !supabase) { setProfile(null); setRooms([]); setActiveId(null); return; }
    let cancelled = false;
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (!cancelled) setProfile(data || { display_name: user.user_metadata?.display_name || 'Khách' });
    });
    loadRooms();
    return () => { cancelled = true; };
  }, [user?.id, loadRooms]);

  useEffect(() => { loadRoomDetails(activeId); }, [activeId, loadRoomDetails]);

  useEffect(() => {
    if (!activeId || !supabase) return;
    const channel = supabase.channel('room-live-' + activeId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'room_id=eq.' + activeId }, () => loadRoomDetails(activeId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: 'room_id=eq.' + activeId }, () => loadRoomDetails(activeId))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'id=eq.' + activeId }, (payload) => setRooms((old) => old.map((r) => r.id === activeId ? { ...r, ...payload.new } : r)))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId, loadRoomDetails]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => { if (profile && (!profile.display_name || profile.display_name === 'Khách') && !localStorage.getItem('watchparty_guest_name')) { setNewDisplayName(''); setModal('rename'); } }, [profile?.id]);

  const saveGuestName = async (event) => {
    event?.preventDefault();
    const name = newDisplayName.trim().slice(0,40);
    if (!name || !user) return;
    setBusy(true); setError('');
    const { error: updateError } = await supabase.from('profiles').upsert({ id: user.id, display_name: name }, { onConflict: 'id' });
    if (updateError) setError(updateError.message);
    else {
      localStorage.setItem('watchparty_guest_name', name);
      await supabase.auth.updateUser({ data: { display_name: name } });
      setProfile((current) => ({ ...current, display_name: name }));
      setModal('');
      setNotice('Đã cập nhật tên hiển thị.');
    }
    setBusy(false);
  };

  const createRoom = async (event) => {
    event?.preventDefault();
    if (!roomName.trim()) return;
    setBusy(true); setError('');
    const { data, error: createError } = await supabase.rpc('create_room', { room_name: roomName.trim() });
    if (createError) setError(createError.message);
    else { const created = Array.isArray(data) ? data[0] : data; setModal(''); setRoomName('Movie night của tụi mình'); await loadRooms(); setActiveId(created?.id || null); setTab('Phòng của tôi'); setNotice('Đã tạo phòng và mở phòng. Chia sẻ mã mời với bạn bè nhé!'); }
    setBusy(false);
  };

  const joinRoom = async (event) => {
    event?.preventDefault();
    if (!joinCode.trim()) return;
    setBusy(true); setError('');
    const { data, error: joinError } = await supabase.rpc('join_room', { code: joinCode.trim() });
    if (joinError) setError(joinError.message);
    else { const joined = Array.isArray(data) ? data[0] : data; setJoinCode(''); setModal(''); await loadRooms(); setActiveId(joined?.id || null); setTab('Phòng của tôi'); setNotice('Đã tham gia và mở phòng.'); }
    setBusy(false);
  };

  const parseYouTubeId = (value) => {
    try {
      const url = new URL(value.trim());
      let id = '';
      if (url.hostname === 'youtu.be' || url.hostname.endsWith('.youtu.be')) id = url.pathname.split('/').filter(Boolean)[0] || '';
      else if (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com') || url.hostname === 'm.youtube.com') {
        if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
        else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2] || '';
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    } catch { return null; }
  };

  const saveYouTubeVideo = async (event) => {
    event?.preventDefault();
    if (!activeRoom || !canControl) return;
    const videoId = parseYouTubeId(youtubeInput);
    if (!videoId) { setError('Link YouTube không hợp lệ.'); return; }
    const next = [...playlist, { id: videoId, url: 'https://www.youtube.com/watch?v=' + videoId }];
    const { error: e } = await supabase.from('rooms').update({ playlist: next, video_id: videoId, video_url: next.at(-1).url, current_video_index: next.length - 1, video_updated_at: new Date().toISOString(), playback_state: 'playing', playback_time: 0, playback_updated_at: new Date().toISOString(), status: 'watching' }).eq('id', activeRoom.id);
    if (e) setError(e.message); else { setYoutubeInput(''); setNotice('Đã thêm video vào danh sách phát.'); }
  };

  const addPlaylistLinks = async (event) => {
    event?.preventDefault();
    if (!canControl || !activeRoom) return;
    const ids = playlistInput.split(/\n|,/).map((x) => parseYouTubeId(x.trim())).filter(Boolean);
    if (!ids.length) { setError('Hãy nhập ít nhất một link YouTube hợp lệ.'); return; }
    const next = [...playlist, ...ids.map((id) => ({ id, url: 'https://www.youtube.com/watch?v=' + id }))];
    const { error: e } = await supabase.from('rooms').update({ playlist: next, video_id: activeRoom.video_id || ids[0], video_url: activeRoom.video_url || 'https://www.youtube.com/watch?v=' + ids[0], current_video_index: activeRoom.video_id ? (activeRoom.current_video_index || 0) : 0, status: 'watching' }).eq('id', activeRoom.id);
    if (e) setError(e.message); else { setPlaylistInput(''); setNotice('Đã thêm ' + ids.length + ' video vào hàng chờ.'); }
  };

  const updatePlayback = async (state, time) => {
    if (!activeRoom || !canControl || syncGuardRef.current) return;
    const { error: e } = await supabase.from('rooms').update({ playback_state: state, playback_time: Math.max(0, Number(time) || 0), playback_updated_at: new Date().toISOString() }).eq('id', activeRoom.id);
    if (e) setError(e.message);
  };

  const playPlaylistIndex = async (index) => {
    if (!activeRoom || !canControl || index < 0 || index >= playlist.length) return;
    const item = playlist[index];
    const { error: e } = await supabase.from('rooms').update({ current_video_index: index, video_id: item.id, video_url: item.url, video_updated_at: new Date().toISOString(), playback_state: 'playing', playback_time: 0, playback_updated_at: new Date().toISOString(), status: 'watching' }).eq('id', activeRoom.id);
    if (e) setError(e.message);
  };

  const grantControl = async (member, allowed) => {
    if (!activeRoom || activeRoom.host_id !== user.id) return;
    const { error: e } = await supabase.from('room_members').update({ can_control: allowed }).eq('room_id', activeRoom.id).eq('user_id', member.user_id);
    if (e) setError(e.message); else setMembers((old) => old.map((m) => m.user_id === member.user_id ? { ...m, can_control: allowed } : m));
  };

  const sendOverlayChat = async (event) => {
    event?.preventDefault();
    const body = message.trim(); if (!body || !activeId || !user) return;
    setMessage('');
    const { error: e } = await supabase.from('messages').insert({ room_id: activeId, user_id: user.id, body });
    if (e) setError(e.message);
  };

  const clearYouTubeVideo = async () => {
    if (!activeRoom || activeRoom.host_id !== user.id) return;
    setVideoBusy(true); setError('');
    const { error: updateError } = await supabase.from('rooms').update({
      video_url: null, video_id: null, video_updated_at: new Date().toISOString(), status: 'waiting'
    }).eq('id', activeRoom.id).eq('host_id', user.id);
    if (updateError) setError(updateError.message);
    else { setNotice('Đã gỡ video khỏi phòng.'); await loadRooms(); }
    setVideoBusy(false);
  };

  const sendMessage = async (event) => {
    event?.preventDefault();
    const body = message.trim();
    if (!body || !activeId || !user) return;
    setMessage('');
    const { error: sendError } = await supabase.from('messages').insert({ room_id: activeId, user_id: user.id, body });
    if (sendError) { setMessage(body); setError(sendError.message); }
  };

  const leaveRoom = async () => {
    if (!activeRoom || !user) return;
    setBusy(true); setError('');
    if (activeRoom.host_id === user.id) {
      const { error: endError } = await supabase.rpc('end_room', { target_room: activeRoom.id });
      if (endError) setError(endError.message);
      else { setActiveId(null); await loadRooms(); setNotice('Đã kết thúc phòng.'); }
    } else {
      const { error: leaveError } = await supabase.from('room_members').delete().eq('room_id', activeRoom.id).eq('user_id', user.id);
      if (leaveError) setError(leaveError.message);
      else { setActiveId(null); await loadRooms(); setNotice('Đã rời phòng.'); }
    }
    setBusy(false);
  };

  const copyInvite = async () => {
    if (!activeRoom) return;
    const inviteUrl = window.location.origin + '/?join=' + activeRoom.invite_code;
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setNotice('Đã sao chép link mời.'); setTimeout(() => setCopied(false), 1800); }
    catch { setNotice('Mã mời: ' + activeRoom.invite_code); }
  };

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('join');
    if (code && user) { setJoinCode(code); setModal('join'); }
  }, [user?.id]);

  if (!supabase) return <div className="auth-screen"><div className="auth-card"><Brand/><h1>Chưa cấu hình kết nối</h1><p>Thiếu biến môi trường Supabase. Hãy thêm VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY trong cấu hình Vercel rồi build lại.</p></div></div>;

  if (!identityReady || !session) return <div className="auth-screen"><div className="auth-card"><Brand/><small className="eyebrow">YOUR CINEMA, YOUR PEOPLE</small><h1>Đang nhận diện thiết bị…</h1><p>WATCH//PARTY đang tạo hoặc khôi phục danh tính khách trên trình duyệt này.</p>{error && <p className="error">{error}</p>}<LoaderCircle className="spin"/></div></div>;

  return <div className="shell" data-theme={theme}>
    <aside className={'sidebar ' + (nav ? 'open' : '')}><Brand/><div className="workspace"><b>{(profile?.display_name || 'W').slice(0,1).toUpperCase()}</b><div>{profile?.display_name || 'Workspace cá nhân'}<small>Thiết bị này</small></div></div><label>MENU CHÍNH</label>
      {['Phòng của tôi','Tham gia phòng'].map((item) => <button key={item} className={'nav ' + (tab === item ? 'active' : '')} onClick={() => { setTab(item); setNav(false); if (item === 'Tham gia phòng') setModal('join'); }}>{item === 'Phòng của tôi' ? <Film/> : <DoorOpen/>}{item}</button>)}
      <label className="space-label">PHÒNG ĐÃ THAM GIA</label>{rooms.slice(0,5).map((room) => <button key={room.id} className="side-room-btn" onClick={() => setActiveId(room.id)}>◉　{room.name}</button>)}
      <div className="side-bottom"><div className="upgrade"><Clapperboard/><b>Đêm phim bắt đầu từ đây</b><p>Tạo phòng riêng và mời bạn bè bằng một đường link.</p><a onClick={() => setModal('create')}>Tạo phòng mới →</a></div><div className="profile"><b>{(profile?.display_name || 'U').slice(0,1).toUpperCase()}</b><div>{profile?.display_name || 'Thành viên'}<small>Khách · Thiết bị này</small></div><button onClick={() => { setNewDisplayName(profile?.display_name || "Khách"); setModal("rename"); }} title="Đổi tên"><Pencil/></button></div></div>
    </aside>
    <main><header><button className="hamb" onClick={() => setNav(!nav)}><Menu/></button><div className="crumb">Workspace　/　<strong>{tab}</strong></div><div className="head-right"><span>Khách đã được nhận diện</span><button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Bật giao diện sáng" : "Bật giao diện tối"} title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}>{theme === "dark" ? <Sun/> : <Moon/>}</button><Bell/><b className="user">{(profile?.display_name || 'U').slice(0,1).toUpperCase()}</b></div></header>
      <div className="content">{activeRoom ? <section className="room-workspace">
        <div className="room-topline"><button className="back-link" onClick={() => setActiveId(null)}>← Danh sách phòng</button><small className="eyebrow">WATCH//PARTY ROOM</small></div>
        <div className="room-heading"><div><small className="eyebrow">PHÒNG ĐANG HOẠT ĐỘNG</small><h1>{activeRoom.name}</h1><p>Phòng riêng · {activeRoom.status === 'watching' ? 'Đang xem' : 'Đang chờ'} · Tạo lúc {new Date(activeRoom.created_at).toLocaleString('vi-VN')}</p></div><button className="secondary" onClick={copyInvite}><Link2/> {copied ? 'Đã sao chép' : 'Mời bạn bè'}</button></div>
        <div className="room-main-grid">
          <div className="room-primary">
            <div className="video-player-section">
              {activeRoom.video_id ? <div className="youtube-frame-wrap" id="youtube-player-container"><div id="youtube-player"></div></div> : <div className="video-empty"><div className="video-empty-icon"><Film/></div><h2>Chưa có video trong phòng</h2><p>Chủ phòng có thể dán link YouTube để phát video nhúng cho các thành viên.</p><small>Hỗ trợ link youtube.com/watch, youtu.be và YouTube Shorts.</small></div>}
              {canControl ? <form className="youtube-link-form" onSubmit={saveYouTubeVideo}><label htmlFor="youtube-url">LINK VIDEO YOUTUBE</label><div><input id="youtube-url" type="url" value={youtubeInput} onChange={(e) => setYoutubeInput(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." required/><button className="primary" disabled={videoBusy}>{videoBusy ? <LoaderCircle className="spin"/> : <Play/>}{activeRoom.video_id ? 'Thay video' : 'Phát video'}</button></div>{activeRoom.video_id && <button type="button" className="video-clear" onClick={clearYouTubeVideo} disabled={videoBusy}>Gỡ video khỏi phòng</button>}<small>Người có quyền điều khiển được thêm video và điều khiển phát.</small></form> : <div className="video-host-note">Nguồn video do chủ phòng quản lý.</div>}
              {canControl && <form className="playlist-add-form" onSubmit={addPlaylistLinks}><label>THÊM NHIỀU VIDEO (MỖI LINK MỘT DÒNG)</label><textarea value={playlistInput} onChange={(e) => setPlaylistInput(e.target.value)} placeholder="Dán nhiều link YouTube, mỗi dòng một link"/><button className="secondary"><ListPlus/> Thêm vào danh sách</button></form>}
              <div className="playlist-panel"><h3><ListPlus/> Danh sách phát <span>{playlist.length} video</span></h3>{playlist.map((item,i)=><div className={'playlist-row '+(i===(activeRoom.current_video_index||0)?'selected':'')} key={item.id+'-'+i}><span>{i+1}</span><a href={item.url} target="_blank" rel="noreferrer">{item.id}</a>{canControl && <button onClick={()=>playPlaylistIndex(i)}>{i===(activeRoom.current_video_index||0)?'Đang chọn':'Phát'}</button>}</div>)}</div>
              <div className="playback-toolbar"><button className="secondary" onClick={()=>setMiniPlayer(true)}><PictureInPicture2/> Popup nổi</button><label><Volume2/><input type="range" min="0" max="100" value={volume} onChange={(e)=>{setVolume(Number(e.target.value));localStorage.setItem('watchparty_volume',e.target.value);playerRef.current?.setVolume(Number(e.target.value));}}/></label><small>Âm lượng riêng trên thiết bị này</small></div>
            </div>
            <div className="room-chat-panel"><div className="panel-heading"><div><h2><MessageCircle/> Trò chuyện trực tiếp</h2><p>Tin nhắn được lưu trong phòng và cập nhật theo thời gian thực.</p></div><span className="live-pill">● LIVE</span></div>
              <div className="room-chat-list">{messages.map((item) => <div className={item.user_id === user.id ? 'room-chat-message own' : 'room-chat-message'} key={item.id}><b>{item.display_name}</b><small>{new Date(item.created_at).toLocaleString('vi-VN')}</small><p>{item.body}</p></div>)}{!messages.length && <div className="room-chat-empty">Chưa có tin nhắn trong phòng. Hãy bắt đầu cuộc trò chuyện.</div>}</div>
              <form className="room-chat-compose" onSubmit={sendMessage}><input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="Viết tin nhắn cho mọi người..." aria-label="Tin nhắn"/><button className="primary" disabled={!message.trim()}><Send/> Gửi</button></form>
            </div>
          </div>
          <aside className="room-info-panel"><div className="panel-heading"><div><h2><Users/> Thành viên</h2><p>{members.length} người trong phòng</p></div></div>
            <div className="room-member-list">{members.map((member) => <div className="room-member-row" key={member.user_id}><b>{(member.display_name || 'K').slice(0,1).toUpperCase()}</b><div><strong>{member.display_name}</strong><small>{member.role === 'host' ? 'Chủ phòng' : member.can_control ? 'Được quyền điều khiển' : 'Thành viên'}</small></div>{member.role === 'host' ? <span>HOST</span> : activeRoom.host_id === user.id ? <button className="permission-toggle" onClick={()=>grantControl(member,!member.can_control)}>{member.can_control?'Thu quyền':'Cấp quyền'}</button> : null}</div>)}</div>
            <div className="invite-panel"><small>MÃ MỜI RIÊNG CỦA PHÒNG</small><strong>{activeRoom.invite_code}</strong><button className="secondary full" onClick={copyInvite}><Copy/> Sao chép link mời</button></div>
            <div className="room-actions-panel"><button className="secondary full" onClick={() => { setNewDisplayName(profile?.display_name || 'Khách'); setModal('rename'); }}><Pencil/> Đổi tên hiển thị</button><button className="leave-room full" onClick={leaveRoom}>{activeRoom.host_id === user.id ? 'Kết thúc phòng' : 'Rời phòng'}</button></div>
          </aside>
        </div>
      </section> : <><section className="hero"><div><small className="eyebrow">✦ YOUR CINEMA, YOUR PEOPLE</small><h1>Phim hay hơn khi<br/><em>xem cùng nhau.</em></h1><p>Tạo không gian riêng, mời hội bạn và cùng tận hưởng từng khoảnh khắc.</p><div className="actions"><button className="primary" onClick={() => setModal('create')}><Plus/> Tạo phòng xem</button><button className="secondary" onClick={() => setModal('join')}><Link2/> Tham gia bằng mã</button></div></div><div className="hero-art"><div className="orbit"></div><div className="screen"><Play fill="currentColor"/><small>YOUR MOVIE NIGHT</small></div><span className="float one">🔒 Phòng riêng tư</span><span className="float two">✦ Cùng bạn bè</span><i>✦</i></div></section>
      <section className="stats"><div><Users/><b>{rooms.length}</b><small>Phòng của bạn</small></div><div><MessageCircle/><b>{members.length}</b><small>Thành viên phòng đang mở</small></div><div><Film/><b>{messages.length}</b><small>Tin nhắn gần đây</small></div><small className="community">Dữ liệu trực tiếp từ WATCH//PARTY</small></section>
      <section className="rooms"><div className="section-head"><div><small className="eyebrow">YOUR WATCH SPACES</small><h2>Phòng của bạn <sup>{filteredRooms.length}</sup></h2></div><div className="tools"><div className="search"><Search/><input placeholder="Tìm phòng..." value={query} onChange={(e) => setQuery(e.target.value)}/></div></div></div>
        {filteredRooms.length ? <div className="grid">{filteredRooms.map((room) => <article className="card" key={room.id}><div className="poster"><div className="poster-head"><small className="wait">● PHÒNG RIÊNG</small><span>···</span></div><div className="art-title">{room.name}</div><div className="poster-foot">WATCH//PARTY　✦</div></div><div className="card-info"><div className="card-title"><div><b>{room.name}</b><small>Mã mời: {room.invite_code}</small></div><span className="faces">🔒</span></div><div className="card-foot"><small>{room.status === 'watching' ? 'Đang xem' : 'Đang chờ'}</small><button onClick={() => setActiveId(room.id)}>Mở phòng <ChevronRight/></button></div></div></article>)}</div> : <div className="empty-state"><div><Film/></div><h3>Chưa có phòng nào</h3><p>Tạo phòng xem đầu tiên hoặc nhập mã mời để tham gia cùng bạn bè. Phòng và tin nhắn được lưu theo danh tính khách trên trình duyệt này.</p><div><button className="primary" onClick={() => setModal('create')}><Plus/> Tạo phòng</button><button className="secondary" onClick={() => setModal('join')}><Link2/> Nhập mã mời</button></div></div>}
      </section></>}<footer>© 2026 WATCH//PARTY <span>Made for movie nights ✦</span><span>Dữ liệu được lưu trên Supabase</span></footer></div></main>
    <aside className="right"><div className="right-title"><div><small className="eyebrow">YOUR CURRENT ROOM</small><h3>Phòng đang mở</h3></div><Settings/></div>
      {activeRoom ? <><div className="room-cover"><Play fill="currentColor"/><b>WATCH<br/>TOGETHER</b></div><b className="room-name">{activeRoom.name}</b><small className="room-status">● {activeRoom.status === 'watching' ? 'Đang xem' : 'Đang chờ'}</small><div className="room-id">MÃ MỜI　<strong>{activeRoom.invite_code}</strong><button onClick={copyInvite}>{copied ? <Check/> : <Copy/>}</button></div><button className="share" onClick={copyInvite}><Link2/> {copied ? 'Đã sao chép link' : 'Chia sẻ lời mời'}</button><hr/><div className="members-title">Thành viên <b>{members.length}</b><a onClick={copyInvite}>Mời bạn +</a></div>
      <div className="member-list">{members.map((member) => <div className="member" key={member.user_id}><b className="face">{(member.display_name || 'U').slice(0,1).toUpperCase()}</b><div>{member.display_name}<small>{member.role === 'host' ? 'Chủ phòng' : 'Thành viên'}</small></div>{member.role === 'host' && <small className="host">HOST</small>}</div>)}</div>
      <hr/><div className="chat-title"><b><MessageCircle/> Trò chuyện</b><small>LIVE</small></div><div className="chat">{messages.map((item) => <div className={item.user_id === user.id ? 'mine' : ''} key={item.id}><small><b>{item.display_name}</b>　{new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small><p>{item.body}</p></div>)}{!messages.length && <p className="chat-empty">Chưa có tin nhắn. Hãy gửi lời chào đầu tiên!</p>}</div><form className="chat-box" onSubmit={sendMessage}><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Gửi tin nhắn..."/><button><Send/></button></form><button className="leave-room" onClick={leaveRoom}>Rời phòng</button></> : <div className="room-empty"><div><Film/></div><h3>Chưa chọn phòng</h3><p>Tạo phòng mới hoặc tham gia phòng bằng mã mời để bắt đầu trò chuyện.</p><button className="primary full" onClick={() => setModal('create')}><Plus/> Tạo phòng xem</button><button className="secondary full" onClick={() => setModal('join')}><Link2/> Tham gia phòng</button></div>}
    </aside>
    {error && <div className="toast error-toast">{error}<button onClick={() => setError('')}><X/></button></div>}{notice && <div className="toast">{notice}</div>}
    {modal && <div className="overlay" onClick={() => setModal('')}><form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={modal === "create" ? createRoom : modal === "join" ? joinRoom : saveGuestName}><button type="button" className="close" onClick={() => setModal('')}><X/></button><div className="dialog-icon">{modal === 'create' ? <Clapperboard/> : modal === 'join' ? <DoorOpen/> : <Pencil/>}</div><small className="eyebrow">{modal === 'create' ? 'START A MOVIE NIGHT' : modal === 'join' ? 'JOIN YOUR FRIENDS' : 'YOUR GUEST IDENTITY'}</small><h2>{modal === 'create' ? 'Tạo phòng xem mới' : modal === 'join' ? 'Tham gia phòng' : 'Đổi tên hiển thị'}</h2><p>{modal === 'create' ? 'Một không gian riêng cho bạn và những người bạn yêu quý.' : modal === 'join' ? 'Nhập mã mời bạn nhận được từ chủ phòng.' : 'Tên này sẽ hiển thị với những người cùng phòng.'}</p>
      {modal === 'rename' ? <label>Tên hiển thị<input maxLength={40} required value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Tên bạn muốn mọi người thấy"/></label> : modal === 'create' ? <><label>Tên phòng<input maxLength={80} required value={roomName} onChange={(e) => setRoomName(e.target.value)}/></label><div className="privacy">🔒　Phòng riêng tư<small>Chỉ người có mã mời mới tham gia được.</small></div></> : <label>Mã mời<input required autoFocus value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Ví dụ: A1B2C3D4"/></label>}
      <button className="primary full" disabled={busy}>{busy ? <LoaderCircle className="spin"/> : null}{modal === 'create' ? 'Tạo phòng' : modal === 'join' ? 'Tham gia phòng' : 'Lưu tên'} <ChevronRight/></button></form></div>}
      {miniPlayer && activeRoom && <div className="mini-player-window"><div className="mini-player-title"><span>{activeRoom.name}</span><button onClick={()=>setMiniPlayer(false)}><X/></button></div><div className="mini-player-video"><div id="mini-youtube-player"></div><div className="mini-chat-overlay">{messages.slice(-3).map(m=><div key={m.id}><b>{m.display_name}: </b>{m.body}</div>)}</div><form className="mini-chat-input" onSubmit={sendOverlayChat}><input value={message} onChange={e=>setMessage(e.target.value)} placeholder="Chat nhanh..."/><button><Send/></button></form></div></div>}
  </div>;
}

function Brand() { return <div className="brand"><i><Play size={15} fill="currentColor"/></i>WATCH<span>//</span>PARTY</div>; }
createRoot(document.getElementById('root')).render(<App/>);
