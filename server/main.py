from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import requests
import tempfile
import os
import xarray as xr
import numpy as np
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import logging


