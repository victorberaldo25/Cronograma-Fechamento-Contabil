const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fechamento-contabil-super-secret-token-key-2026';

// ----------------------------------------------------
// FIREBASE ADMIN SDK INITIALIZATION
// ----------------------------------------------------
if (process.env.FUNCTIONS_EMULATOR || process.env.FIRESTORE_EMULATOR_HOST) {
  admin.initializeApp();
} else {
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  try {
    const fs = require('fs');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin initialized via serviceAccountKey.json');
    } else {
      admin.initializeApp();
      console.log('Firebase Admin initialized with default credentials.');
    }
  } catch (e) {
    console.warn('Firebase Admin fallback initialization:', e.message);
  }
}

const db = admin.firestore();

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Generate Unique IDs
function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper: Convert Date or String to YYYY-MM based on the 16th-to-15th rule.
function getCompetenciaFromDate(dateInput) {
  if (!dateInput) return '';
  let dateObj;
  if (typeof dateInput === 'string') {
    const parts = dateInput.substring(0, 10).split('-');
    if (parts.length < 3) return dateInput.substring(0, 7);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (day >= 16) {
      return `${year}-${String(month).padStart(2, '0')}`;
    } else {
      const prev = new Date(year, month - 2, 1);
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    }
  } else {
    dateObj = (typeof dateInput.toDate === 'function') ? dateInput.toDate() : new Date(dateInput);
    const day = dateObj.getDate();
    if (day >= 16) {
      return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
    } else {
      const prev = new Date(dateObj.getFullYear(), dateObj.getMonth() - 1, 1);
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    }
  }
}

// Helper: Shift Date to Target Competência (Safe 16-15 boundary handling)
function shiftDateToCompetencia(dateObj, targetCompetencia) {
  const [targetYear, targetMonth] = targetCompetencia.split('-').map(Number); // e.g. 2026, 7
  const originalDay = dateObj.getDate();
  
  let newYear = targetYear;
  let newMonth = targetMonth; // 1-indexed
  
  if (originalDay >= 16) {
    // Keep target month
  } else {
    // Move to next month
    newMonth += 1;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
  }
  
  const maxDaysInNewMonth = new Date(newYear, newMonth, 0).getDate();
  const newDay = Math.min(originalDay, maxDaysInNewMonth);
  
  const newDate = new Date(dateObj);
  newDate.setFullYear(newYear);
  newDate.setMonth(newMonth - 1);
  newDate.setDate(newDay);
  return newDate;
}

// Helper: Parse Date String or Date Object to Firestore Timestamp
function toFirestoreTimestamp(val) {
  if (!val) return null;
  if (val instanceof admin.firestore.Timestamp) return val;
  const d = new Date(val);
  return admin.firestore.Timestamp.fromDate(d);
}

// Helper: Convert Firestore Timestamp to Date ISO string substring(0, 10)
function timestampToDateStr(ts) {
  if (!ts) return '';
  const dateObj = (typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
  return dateObj.toISOString().substring(0, 10);
}

// Helper: Convert Firestore Timestamp to Date ISO string
function timestampToISOStr(ts) {
  if (!ts) return null;
  const dateObj = (typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
  return dateObj.toISOString();
}

// ----------------------------------------------------
// FIREBASE DATABASE BOOTSTRAP (Seeding initial values)
// ----------------------------------------------------
async function bootstrapDB() {
  try {
    const sectorsSnap = await db.collection('setores').limit(1).get();
    if (sectorsSnap.empty) {
      const defaultSectors = [
        { id: 'sec_fiscal', nome_setor: 'Fiscal', description: '#f5a623' },
        { id: 'sec_contab', nome_setor: 'Contabilidade', description: '#4f7fff' },
        { id: 'sec_tributario', nome_setor: 'Tributário', description: '#a78bfa' },
        { id: 'sec_financeiro', nome_setor: 'Financeiro', description: '#3ecf8e' }
      ];
      const batch = db.batch();
      defaultSectors.forEach(sec => {
        const docRef = db.collection('setores').doc(sec.id);
        batch.set(docRef, sec);
      });
      await batch.commit();
      console.log('Default sectors seeded in Firestore ("setores" collection).');
    }

    const usersSnap = await db.collection('usuarios').limit(1).get();
    if (usersSnap.empty) {
      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync('admin123', salt);
      const adminUser = {
        uid: 'usr_admin',
        email: 'admin@fecho.com',
        nome: 'Administrador',
        passwordHash: passwordHash,
        is_admin: true,
        setores_vinculados: []
      };
      await db.collection('usuarios').doc(adminUser.uid).set(adminUser);
      console.log('Default Admin user seeded in Firestore ("usuarios" collection: admin@fecho.com / admin123).');
    }
  } catch (err) {
    console.error('Error bootstrapping Firestore database:', err.message);
  }
}

bootstrapDB().catch(console.error);

// ----------------------------------------------------
// AUTHENTICATION MIDDLEWARES
// ----------------------------------------------------
async function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userDoc = await db.collection('usuarios').doc(decoded.uid).get();
    if (!userDoc.exists) {
      res.clearCookie('token');
      return res.status(401).json({ message: 'Usuário não encontrado no sistema.' });
    }
    
    const user = userDoc.data();
    req.user = {
      uid: user.uid,
      email: user.email,
      nome: user.nome || user.email,
      is_admin: user.is_admin || false,
      role: user.role || (user.is_admin ? 'admin' : 'usuario'),
      setores_vinculados: user.setores_vinculados || []
    };
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(403).json({ message: 'Token inválido ou expirado.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.is_admin === true) {
    next();
  } else {
    res.status(403).json({ message: 'Acesso negado. Recurso restrito a administradores.' });
  }
}

// ----------------------------------------------------
// AUTHENTICATION ENDPOINTS
// ----------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const snapshot = await db.collection('usuarios').where('email', '==', email.toLowerCase().trim()).limit(1).get();
    
    if (snapshot.empty) {
      return res.status(401).json({ message: 'Usuário ou senha incorretos.' });
    }
    
    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    if (!bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ message: 'Usuário ou senha incorretos.' });
    }

    const token = jwt.sign(
      { uid: user.uid, email: user.email, is_admin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      id: user.uid,
      email: user.email,
      nome: user.nome || user.email,
      is_admin: user.is_admin || false,
      role: user.role || (user.is_admin ? 'admin' : 'usuario'),
      sectors: user.setores_vinculados || []
    });
  } catch (err) {
    console.error('Error logging in:', err);
    return res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ message: 'Logout efetuado com sucesso.' });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  return res.json({
    id: req.user.uid,
    email: req.user.email,
    nome: req.user.nome,
    is_admin: req.user.is_admin,
    role: req.user.role,
    sectors: req.user.setores_vinculados
  });
});


// ----------------------------------------------------
// SECTORS ENDPOINTS (RBAC managed)
// ----------------------------------------------------

app.get('/api/sectors', authenticateToken, async (req, res) => {
  try {
    const snapshot = await db.collection('setores').get();
    const sectors = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      sectors.push({
        id: data.id || doc.id,
        name: data.nome_setor,
        description: data.description || '#4f7fff'
      });
    });
    return res.json(sectors);
  } catch (err) {
    return res.status(500).json({ message: 'Erro ao buscar setores.' });
  }
});

app.post('/api/sectors', authenticateToken, requireAdmin, async (req, res) => {
  const { name, description } = req.body; // description stores sector color hex in the mockup
  if (!name) {
    return res.status(400).json({ message: 'O nome do setor é obrigatório.' });
  }

  try {
    const snapshot = await db.collection('setores').where('nome_setor', '==', name).get();
    if (!snapshot.empty) {
      return res.status(400).json({ message: 'Já existe um setor com este nome.' });
    }

    const id = generateId('sec');
    const newSector = {
      id,
      nome_setor: name,
      description: description || '#4f7fff'
    };

    await db.collection('setores').doc(id).set(newSector);
    return res.status(201).json({
      id: newSector.id,
      name: newSector.nome_setor,
      description: newSector.description
    });
  } catch (err) {
    return res.status(500).json({ message: 'Erro ao criar setor.' });
  }
});

app.put('/api/sectors/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'O nome do setor é obrigatório.' });
  }

  try {
    const docRef = db.collection('setores').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ message: 'Setor não encontrado.' });
    }

    const snapshot = await db.collection('setores').where('nome_setor', '==', name).get();
    const exists = snapshot.docs.some(d => d.id !== id);
    if (exists) {
      return res.status(400).json({ message: 'Já existe outro setor com este nome.' });
    }

    const updatedData = {
      nome_setor: name,
      description: description || '#4f7fff'
    };

    await docRef.update(updatedData);
    return res.json({
      id,
      name: updatedData.nome_setor,
      description: updatedData.description
    });
  } catch (err) {
    return res.status(500).json({ message: 'Erro ao atualizar setor.' });
  }
});

app.delete('/api/sectors/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const docRef = db.collection('setores').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ message: 'Setor não encontrado.' });
    }

    await docRef.delete();

    // Clean up user relations (setores_vinculados)
    const usersSnap = await db.collection('usuarios').get();
    const batch = db.batch();
    usersSnap.forEach(userDoc => {
      const userData = userDoc.data();
      if (userData.setores_vinculados && userData.setores_vinculados.includes(id)) {
        batch.update(userDoc.ref, {
          setores_vinculados: admin.firestore.FieldValue.arrayRemove(id)
        });
      }
    });
    await batch.commit();

    return res.json({ message: 'Setor excluído com sucesso.' });
  } catch (err) {
    return res.status(500).json({ message: 'Erro ao excluir setor.' });
  }
});


// ----------------------------------------------------
// USERS ENDPOINTS (Admin only)
// ----------------------------------------------------

app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('usuarios').get();
    const sanitized = [];
    snapshot.forEach(doc => {
      const u = doc.data();
      sanitized.push({
        id: u.uid || doc.id,
        email: u.email,
        nome: u.nome,
        is_admin: u.is_admin || false,
        role: u.role || (u.is_admin ? 'admin' : 'usuario'),
        sectors: u.setores_vinculados || []
      });
    });
    return res.json(sanitized);
  } catch (err) {
    return res.status(500).json({ message: 'Erro ao buscar usuários.' });
  }
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  const { email, nome, password, is_admin, sectors, setores_vinculados } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'E-mail, senha e nome são obrigatórios.' });
  }

  try {
    const snapshot = await db.collection('usuarios').where('email', '==', email.toLowerCase().trim()).get();
    if (!snapshot.empty) {
      return res.status(400).json({ message: 'E-mail já cadastrado.' });
    }

    const inputSectors = sectors || setores_vinculados;
    const sectorsArray = Array.isArray(inputSectors) ? inputSectors : [];
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const uid = generateId('usr');

    const newUser = {
      uid,
      email: email.toLowerCase().trim(),
      nome: nome || email,
      passwordHash,
      is_admin: is_admin === true,
      role: role || (is_admin === true ? 'admin' : 'usuario'),
      setores_vinculados: (is_admin === true) ? [] : sectorsArray
    };

    await db.collection('usuarios').doc(uid).set(newUser);

    return res.status(201).json({
      id: newUser.uid,
      email: newUser.email,
      nome: newUser.nome,
      is_admin: newUser.is_admin,
      role: newUser.role,
      sectors: newUser.setores_vinculados
    });
  } catch (err) {
    console.error('Error creating user:', err);
    return res.status(500).json({ message: 'Erro ao criar usuário.' });
  }
});

app.put('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { email, nome, password, is_admin, sectors, setores_vinculados } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'E-mail é obrigatório.' });
  }

  try {
    const docRef = db.collection('usuarios').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    const snapshot = await db.collection('usuarios').where('email', '==', email.toLowerCase().trim()).get();
    const exists = snapshot.docs.some(d => d.id !== id);
    if (exists) {
      return res.status(400).json({ message: 'E-mail já cadastrado para outro usuário.' });
    }

    const inputSectors = sectors || setores_vinculados;
    const sectorsArray = Array.isArray(inputSectors) ? inputSectors : [];
    const updateData = {
      email: email.toLowerCase().trim(),
      nome: nome || email,
      is_admin: is_admin === true,
      role: role || (is_admin === true ? 'admin' : 'usuario'),
      setores_vinculados: (is_admin === true) ? [] : sectorsArray
    };

    if (password && password.trim() !== '') {
      const salt = bcrypt.genSaltSync(10);
      updateData.passwordHash = bcrypt.hashSync(password, salt);
    }

    await docRef.update(updateData);

    const updatedUser = (await docRef.get()).data();
    return res.json({
      id: updatedUser.uid,
      email: updatedUser.email,
      nome: updatedUser.nome,
      is_admin: updatedUser.is_admin,
      role: updatedUser.role || (updatedUser.is_admin ? 'admin' : 'usuario'),
      sectors: updatedUser.setores_vinculados
    });
  } catch (err) {
    return res.status(500).json({ message: 'Erro ao atualizar usuário.' });
  }
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  if (id === req.user.uid) {
    return res.status(400).json({ message: 'Você não pode excluir o seu próprio usuário logado.' });
  }

  try {
    const docRef = db.collection('usuarios').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    await docRef.delete();
    return res.json({ message: 'Usuário excluído com sucesso.' });
  } catch (err) {
    return res.status(500).json({ message: 'Erro ao excluir usuário.' });
  }
});


// ----------------------------------------------------
// ACTIVITIES ENDPOINTS (RBAC and SLA Flows)
// ----------------------------------------------------

// GET /api/activities?competencia=YYYY-MM
app.get('/api/activities', authenticateToken, async (req, res) => {
  let { competencia } = req.query;
  if (!competencia) {
    const today = new Date();
    competencia = getCompetenciaFromDate(today);
  }

  try {
    // 1. Fetch all activities from collection "atividades"
    const snapshot = await db.collection('atividades').get();
    let activities = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      activities.push({
        id: data.id || doc.id,
        ...data
      });
    });

    // 2. Identify base recurring activities (recorrente === true, clonedFrom === null)
    const baseRecurring = activities.filter(a => a.recorrente === true && !a.clonedFrom && a.competencia <= competencia);

    // 3. Auto-cloning logic
    const batch = db.batch();
    let clonedCreated = false;

    for (const base of baseRecurring) {
      if (base.competencia === competencia) continue;

      const hasClone = activities.some(a => a.clonedFrom === base.id && a.competencia === competencia);
      if (!hasClone) {
        const docRef = db.collection('atividades').doc();
        
        // Retrieve base date objects safely
        const baseStart = base.prazo_inicio ? (base.prazo_inicio.toDate ? base.prazo_inicio.toDate() : new Date(base.prazo_inicio)) : new Date();
        const baseEnd = base.prazo_fim ? (base.prazo_fim.toDate ? base.prazo_fim.toDate() : new Date(base.prazo_fim)) : new Date();
        
        // Calculate shifted dates based on target month
        const newStartDate = shiftDateToCompetencia(baseStart, competencia);
        const newEndDate = shiftDateToCompetencia(baseEnd, competencia);
        
        let status = 'pendente';
        let data_envio = null;
        const slaHistory = [];
        
        // If it was interdepartmental, initialize it as "aguardando_confirmacao"
        if (base.setor_destino && base.setor_destino !== base.setor_origem) {
          status = 'aguardando_confirmacao';
          data_envio = admin.firestore.Timestamp.now();
          slaHistory.push({
            fromSectorId: base.setor_origem,
            toSectorId: base.setor_destino,
            sentAt: new Date().toISOString(),
            confirmedAt: null,
            durationMs: null
          });
        }

        const clone = {
          id: docRef.id,
          titulo: base.titulo,
          observacao: base.observacao || '',
          prazo_inicio: admin.firestore.Timestamp.fromDate(newStartDate),
          prazo_fim: admin.firestore.Timestamp.fromDate(newEndDate),
          setor_origem: base.setor_origem,
          currentSectorId: base.setor_origem, // suporta o fluxo do setor atual
          setor_destino: base.setor_destino || base.setor_origem,
          status,
          createdBy: base.createdBy,
          criadoEm: admin.firestore.Timestamp.now(),
          data_envio,
          data_confirmacao_sla: null,
          completedAt: null,
          slaHistory,
          recorrente: true,
          clonedFrom: base.id,
          competencia: competencia
        };

        batch.set(docRef, clone);
        activities.push(clone); // Add to memory array to include in response
        clonedCreated = true;
      }
    }

    if (clonedCreated) {
      await batch.commit();
    }

    // 4. Filter activities matching target month
    let monthlyActivities = activities.filter(a => a.competencia === competencia);

    // 5. Apply RBAC filtering
    const { is_admin, sectores_vinculados } = req.user;
    if (is_admin !== true) {
      monthlyActivities = monthlyActivities.filter(act => {
        const isOrigin = sectores_vinculados.includes(act.setor_origem);
        const isCurrent = sectores_vinculados.includes(act.currentSectorId || act.setor_origem);
        const isDest = act.setor_destino && sectores_vinculados.includes(act.setor_destino);
        
        const wasInHistory = act.slaHistory && act.slaHistory.some(history => 
          sectores_vinculados.includes(history.fromSectorId) || sectores_vinculados.includes(history.toSectorId)
        );

        return isOrigin || isCurrent || isDest || wasInHistory;
      });
    }

    // Map database properties (Portguese database fields) to frontend properties (UI expectations)
    const mapped = monthlyActivities.map(a => ({
      id: a.id,
      nome: a.titulo,
      obs: a.observacao,
      inicio: timestampToDateStr(a.prazo_inicio),
      fim: timestampToDateStr(a.prazo_fim),
      origemId: a.setor_origem,
      destinoId: a.setor_destino || a.setor_origem,
      status: a.status,
      criadoEm: timestampToISOStr(a.criadoEm || a.createdAt),
      confirmedAt: timestampToISOStr(a.data_confirmacao_sla),
      completedAt: timestampToISOStr(a.completedAt),
      sentAt: timestampToISOStr(a.data_envio),
      recorrente: a.recorrente || false,
      clonedFrom: a.clonedFrom || null,
      competencia: a.competencia
    }));

    return res.json(mapped);
  } catch (err) {
    console.error('Error fetching activities:', err);
    return res.status(500).json({ message: 'Erro ao buscar atividades.' });
  }
});

// POST /api/activities (Creation / Process Input)
app.post('/api/activities', authenticateToken, async (req, res) => {
  const { titulo, observacao, prazo_inicio, prazo_fim, setor_origem, setor_destino, recorrente } = req.body;

  if (!titulo || !prazo_inicio || !prazo_fim || !setor_origem) {
    return res.status(400).json({ message: 'Título da atividade, prazo de início, prazo de fim e setor de origem são obrigatórios.' });
  }

  try {
    const originSectorDoc = await db.collection('setores').doc(setor_origem).get();
    if (!originSectorDoc.exists) {
      return res.status(400).json({ message: 'Setor de origem inválido.' });
    }

    if (req.user.is_admin !== true && !req.user.setores_vinculados.includes(setor_origem)) {
      return res.status(403).json({ message: 'Você não tem permissão para cadastrar atividades para este setor.' });
    }

    let status = 'pendente';
    let targetDestSectorId = setor_origem;
    let data_envio = null;
    const slaHistory = [];

    // Destination logic
    if (setor_destino && setor_destino.trim() !== '' && setor_destino !== setor_origem) {
      const destSectorDoc = await db.collection('setores').doc(setor_destino).get();
      if (!destSectorDoc.exists) {
        return res.status(400).json({ message: 'Setor de destino inválido.' });
      }
      
      status = 'aguardando_confirmacao';
      targetDestSectorId = setor_destino;
      data_envio = admin.firestore.Timestamp.now();
      
      slaHistory.push({
        fromSectorId: setor_origem,
        toSectorId: setor_destino,
        sentAt: new Date().toISOString(),
        confirmedAt: null,
        durationMs: null
      });
    }

    // Determine Monthly competency based on startDeadline / prazo_inicio
    // prazo_inicio could be ISO string (e.g., '2026-06-03T00:00:00.000Z' or '2026-06-03')
    const competencia = getCompetenciaFromDate(prazo_inicio);

    const id = generateId('act');
    const newActivity = {
      id,
      titulo,
      observacao: observacao || '',
      prazo_inicio: toFirestoreTimestamp(prazo_inicio),
      prazo_fim: toFirestoreTimestamp(prazo_fim),
      setor_origem,
      currentSectorId: setor_origem,
      setor_destino: targetDestSectorId,
      status,
      createdBy: req.user.uid,
      criadoEm: admin.firestore.Timestamp.now(),
      data_envio,
      data_confirmacao_sla: null,
      completedAt: null,
      slaHistory,
      recorrente: recorrente === true,
      clonedFrom: null,
      competencia
    };

    await db.collection('atividades').doc(id).set(newActivity);
    return res.status(201).json({
      id: newActivity.id,
      nome: newActivity.titulo,
      obs: newActivity.observacao,
      inicio: timestampToDateStr(newActivity.prazo_inicio),
      fim: timestampToDateStr(newActivity.prazo_fim),
      origemId: newActivity.setor_origem,
      destinoId: newActivity.setor_destino,
      status: newActivity.status,
      criadoEm: timestampToISOStr(newActivity.criadoEm),
      confirmedAt: null,
      completedAt: null,
      sentAt: timestampToISOStr(newActivity.data_envio),
      recorrente: newActivity.recorrente,
      clonedFrom: null,
      competencia: newActivity.competencia
    });
  } catch (err) {
    console.error('Error creating activity:', err);
    return res.status(500).json({ message: 'Erro ao criar atividade.' });
  }
});

// POST /api/activities/:id/confirm
app.post('/api/activities/:id/confirm', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const docRef = db.collection('atividades').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ message: 'Atividade não encontrada.' });
    }

    const activity = doc.data();

    if (activity.status !== 'aguardando_confirmacao' || !activity.setor_destino) {
      return res.status(400).json({ message: 'Esta atividade não está aguardando confirmação de recebimento.' });
    }

    if (req.user.is_admin !== true && !req.user.setores_vinculados.includes(activity.setor_destino)) {
      return res.status(403).json({ message: 'Você não tem permissão para confirmar recebimento neste setor.' });
    }

    const now = new Date();
    const nowTimestamp = admin.firestore.Timestamp.fromDate(now);
    const slaHistory = activity.slaHistory || [];

    if (slaHistory.length > 0) {
      const lastItem = slaHistory[slaHistory.length - 1];
      if (lastItem.toSectorId === activity.setor_destino && !lastItem.confirmedAt) {
        lastItem.confirmedAt = now.toISOString();
        const sentTime = new Date(lastItem.sentAt);
        lastItem.durationMs = now.getTime() - sentTime.getTime();
      }
    }

    const updatedFields = {
      status: 'concluido', // changes directly to concluído upon receipt confirmation
      data_confirmacao_sla: nowTimestamp,
      currentSectorId: activity.setor_destino,
      slaHistory
    };

    await docRef.update(updatedFields);
    
    const updatedDoc = { ...activity, ...updatedFields };
    return res.json({
      id: updatedDoc.id || id,
      nome: updatedDoc.titulo,
      obs: updatedDoc.observacao,
      inicio: timestampToDateStr(updatedDoc.prazo_inicio),
      fim: timestampToDateStr(updatedDoc.prazo_fim),
      origemId: updatedDoc.setor_origem,
      destinoId: updatedDoc.setor_destino,
      status: updatedDoc.status,
      criadoEm: timestampToISOStr(updatedDoc.criadoEm),
      confirmedAt: timestampToISOStr(updatedDoc.data_confirmacao_sla),
      completedAt: timestampToISOStr(updatedDoc.completedAt),
      sentAt: timestampToISOStr(updatedDoc.data_envio),
      recorrente: updatedDoc.recorrente || false,
      clonedFrom: updatedDoc.clonedFrom || null,
      competencia: updatedDoc.competencia
    });
  } catch (err) {
    console.error('Error confirming activity:', err);
    return res.status(500).json({ message: 'Erro ao confirmar recebimento.' });
  }
});

// POST /api/activities/:id/complete
app.post('/api/activities/:id/complete', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const docRef = db.collection('atividades').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ message: 'Atividade não encontrada.' });
    }

    const activity = doc.data();

    if (activity.status === 'concluido') {
      return res.status(400).json({ message: 'Esta atividade já está concluída.' });
    }
    if (activity.status === 'aguardando_confirmacao') {
      return res.status(400).json({ message: 'Aguardando confirmação de recebimento no setor de destino.' });
    }

    if (req.user.is_admin !== true && !req.user.setores_vinculados.includes(activity.currentSectorId || activity.setor_origem)) {
      return res.status(403).json({ message: 'Você não tem permissão para concluir atividades deste setor.' });
    }

    const updatedFields = {
      status: 'concluido',
      completedAt: admin.firestore.Timestamp.now()
    };

    await docRef.update(updatedFields);

    const updatedDoc = { ...activity, ...updatedFields };
    return res.json({
      id: updatedDoc.id || id,
      nome: updatedDoc.titulo,
      obs: updatedDoc.observacao,
      inicio: timestampToDateStr(updatedDoc.prazo_inicio),
      fim: timestampToDateStr(updatedDoc.prazo_fim),
      origemId: updatedDoc.setor_origem,
      destinoId: updatedDoc.setor_destino,
      status: updatedDoc.status,
      criadoEm: timestampToISOStr(updatedDoc.criadoEm),
      confirmedAt: timestampToISOStr(updatedDoc.data_confirmacao_sla),
      completedAt: timestampToISOStr(updatedDoc.completedAt),
      sentAt: timestampToISOStr(updatedDoc.data_envio),
      recorrente: updatedDoc.recorrente || false,
      clonedFrom: updatedDoc.clonedFrom || null,
      competencia: updatedDoc.competencia
    });
  } catch (err) {
    return res.status(500).json({ message: 'Erro ao concluir atividade.' });
  }
});

// Fallback index.html serve
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// If executing locally, run server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running locally on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
  });
}

// Export the Express app directly for tests, and the function api wrapper for Firebase Functions
exports.app = app;
exports.api = onRequest({ cors: true }, app);
