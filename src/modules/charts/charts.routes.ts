import { Router } from 'express';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { ChartsService } from './charts.service';

const router = Router();
const service = new ChartsService();

router.get('/by-lake/:lakeId', async (req, res) => {
  try {
    const charts = await service.findByLake(Number(req.params.lakeId));
    res.json(charts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/by-river/:riverId', async (req, res) => {
  try {
    const charts = await service.findByRiver(Number(req.params.riverId));
    res.json(charts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/by-spring/:springId', async (req, res) => {
  try {
    const charts = await service.findBySpring(Number(req.params.springId));
    res.json(charts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/data', async (req, res) => {
  try {
    const data = await service.getChartData(req.params.id);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.use(authenticate);

router.get('/preview', async (req, res) => {
  try {
    const { tableId, indicators, sources, lakeId, riverId, springId, accommodationId, touristStopId, organizerId } = req.query;
    
    if (!tableId || !indicators) {
      return res.status(400).json({ message: 'tableId and indicators are required' });
    }

    const previewData = await service.getPreviewData({
      tableId: String(tableId),
      indicators: JSON.parse(String(indicators)),
      sources: sources ? JSON.parse(String(sources)) : [{ tableId: String(tableId), year: 0, label: 'Данные' }],
      lakeId: lakeId ? Number(lakeId) : undefined,
      riverId: riverId ? Number(riverId) : undefined,
      springId: springId ? Number(springId) : undefined,
      accommodationId: accommodationId ? Number(accommodationId) : undefined,
      touristStopId: touristStopId ? Number(touristStopId) : undefined,
      organizerId: organizerId ? Number(organizerId) : undefined,
    });
    
    res.json(previewData);
  } catch (error: any) {
    console.error('Preview error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const charts = await service.findAll({
      userId: req.user!.userId,
      userRole: req.user!.role,
      groupBy: req.query.groupBy as string,
      search: req.query.search as string,
      lakeId: req.query.lakeId ? Number(req.query.lakeId) : undefined,
      riverId: req.query.riverId ? Number(req.query.riverId) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
      objectType: req.query.objectType as string,
      onlyMine: req.query.onlyMine === 'true',
    });
    res.json(charts);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const chart = await service.findById(req.params.id);
    if (!chart) {
      return res.status(404).json({ message: 'График не найден' });
    }
    res.json(chart);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/data', async (req, res) => {
  try {
    const data = await service.getChartData(req.params.id);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const chart = await service.create(req.body, req.user!.userId);
    res.status(201).json(chart);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/:id', requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const chart = await service.update(req.params.id, req.body, req.user!.userId, req.user!.role);
    res.json(chart);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requireRole('ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    await service.delete(req.params.id, req.user!.userId, req.user!.role);
    res.json({ message: 'График удалён' });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;