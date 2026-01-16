import express from 'express'
import cors from 'cors'
import { authRoutes } from './routes/auth.route'
import { userRoutes } from './routes/user.route'
import { marketplaceRoutes } from './routes/marketplace.route'
import { vendaRoutes } from './routes/venda.route'
import { pagamentoRoutes } from './routes/pagamento.route'

const app = express()

// Middleware de CORS para permitir a conexão com o Front-end (Vite)
app.use(cors()) 

// Middleware para que o Express entenda JSON no corpo das requisições (body)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Registro das Rotas da Aplicação
app.use('/auth', authRoutes)        // Login e Autenticação
app.use('/users', userRoutes)       // Cadastro e Gestão de Usuários
app.use('/marketplaces', marketplaceRoutes) // CRUD de Marketplaces
app.use('/vendas', vendaRoutes)     // CRUD de Vendas com cálculo de líquido
app.use('/pagamentos', pagamentoRoutes) // CRUD de Pagamentos vinculados

export { app }